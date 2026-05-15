// Cowork v1 — hourly cron entry point (BDEV-510).
//
// Triggered by Vercel cron (see vercel.json) once per hour. Polls
// Sentry, builds fingerprints, deduplicates against Jira, and either
// shadow-logs or files a draft ticket per new Sentry issue. Every
// decision is written to the audit log.
//
// All seven guardrails from BDEV-510 are enforced here:
//   1. Read-only shadow mode default — COWORK_MODE
//   2. Rate limits — COWORK_MAX_TICKETS_PER_HOUR / _PER_DAY
//   3. Budget cap — COWORK_MAX_ANTHROPIC_TOKENS_PER_DAY
//   4. Idempotency — JQL search for the cowork-fingerprint-* label
//   5. Tiered authority — this route only files drafts and comments
//   6. Kill switch — COWORK_ENABLED
//   7. Audit log — appendAuditLog per decision
//
// The handler accepts both GET (cron + manual browser hit) and POST
// (some Vercel cron configs prefer POST). Both share the same
// implementation.

import { NextResponse } from "next/server";
import {
  appendAuditLog,
  buildFallbackDescription,
  buildFingerprint,
  evaluateGuardrails,
  fetchSentryIssues,
  fingerprintLabel,
  generateDraftDescription,
  isCronRequestAuthorized,
  newAuditEntry,
  readCounters,
  readCoworkConfig,
  readSentryCursor,
  recordFiledTicket,
  recordTokenSpend,
  routeToEpic,
  writeSentryCursor,
  COWORK_LABEL_DRAFT,
  type AuditEntry,
  type DraftDescription,
  type SentryIssue,
} from "@/lib/cowork";
import { jiraFetch, readJiraConfig } from "@/lib/mvp-ticket-checklist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
// Allow the cron up to 60s — Sentry fetch + dedup search + per-issue
// Haiku calls can run long if there are several new issues.
export const maxDuration = 60;

type RunResponse = {
  status: "ok" | "disabled" | "rate-limited" | "no-credentials" | "error";
  mode: string;
  filed: number;
  wouldFile: number;
  deduped: number;
  errors: number;
  scanned: number;
  audit: AuditEntry[];
  guardrail?: { reason: string; details?: Record<string, unknown> };
  message?: string;
};

export async function GET(request: Request): Promise<NextResponse<RunResponse>> {
  return runCron(request);
}

export async function POST(request: Request): Promise<NextResponse<RunResponse>> {
  return runCron(request);
}

async function runCron(request: Request): Promise<NextResponse<RunResponse>> {
  const startedAt = new Date();
  const config = readCoworkConfig();

  if (!isCronRequestAuthorized(request, config)) {
    return NextResponse.json(
      {
        status: "error",
        mode: config.mode,
        filed: 0,
        wouldFile: 0,
        deduped: 0,
        errors: 0,
        scanned: 0,
        audit: [],
        message: "Unauthorized",
      },
      { status: 401 },
    );
  }

  // Guardrail 6 — kill switch.
  if (!config.enabled) {
    const entry = newAuditEntry({
      decision: "disabled",
      mode: "n/a",
      reason: "COWORK_ENABLED is false",
    });
    await appendAuditLog([entry]);
    console.log("[cowork:run]", JSON.stringify(entry));
    return NextResponse.json({
      status: "disabled",
      mode: config.mode,
      filed: 0,
      wouldFile: 0,
      deduped: 0,
      errors: 0,
      scanned: 0,
      audit: [entry],
      message: "Cowork is disabled. Set COWORK_ENABLED=true to enable.",
    });
  }

  const counters = await readCounters(startedAt);

  // Guardrails 2 + 3 — rate limits + budget.
  const guardrail = evaluateGuardrails(config, counters);
  if (!guardrail.ok) {
    const entry = newAuditEntry({
      decision: "guardrail-block",
      mode: config.mode,
      reason: guardrail.reason,
      details: guardrail.details,
    });
    await appendAuditLog([entry]);
    console.log("[cowork:run]", JSON.stringify(entry));
    return NextResponse.json({
      status: "rate-limited",
      mode: config.mode,
      filed: 0,
      wouldFile: 0,
      deduped: 0,
      errors: 0,
      scanned: 0,
      audit: [entry],
      guardrail: { reason: guardrail.reason, details: guardrail.details },
    });
  }

  if (!config.sentryAuthToken) {
    const entry = newAuditEntry({
      decision: "skipped",
      mode: config.mode,
      reason: "missing-env:SENTRY_AUTH_TOKEN",
    });
    await appendAuditLog([entry]);
    return NextResponse.json({
      status: "no-credentials",
      mode: config.mode,
      filed: 0,
      wouldFile: 0,
      deduped: 0,
      errors: 0,
      scanned: 0,
      audit: [entry],
      message: "SENTRY_AUTH_TOKEN is not configured.",
    });
  }

  const jiraConfig = readJiraConfig();
  if ("missingEnv" in jiraConfig) {
    const entry = newAuditEntry({
      decision: "skipped",
      mode: config.mode,
      reason: `missing-env:${jiraConfig.missingEnv.join(",")}`,
    });
    await appendAuditLog([entry]);
    return NextResponse.json({
      status: "no-credentials",
      mode: config.mode,
      filed: 0,
      wouldFile: 0,
      deduped: 0,
      errors: 0,
      scanned: 0,
      audit: [entry],
      message: "Jira is not configured.",
    });
  }

  // Sentry fetch (cursored).
  const cursor = await readSentryCursor();
  let issues: SentryIssue[];
  let rawCount = 0;
  try {
    const fetched = await fetchSentryIssues(config, { sinceTimestamp: cursor });
    issues = fetched.issues;
    rawCount = fetched.rawCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sentry fetch failed";
    const entry = newAuditEntry({
      decision: "skipped",
      mode: config.mode,
      reason: `sentry-fetch-error:${message}`,
    });
    await appendAuditLog([entry]);
    return NextResponse.json(
      {
        status: "error",
        mode: config.mode,
        filed: 0,
        wouldFile: 0,
        deduped: 0,
        errors: 1,
        scanned: 0,
        audit: [entry],
        message,
      },
      { status: 502 },
    );
  }

  if (issues.length === 0) {
    const entry = newAuditEntry({
      decision: "no-new-events",
      mode: config.mode,
      reason: cursor ? `no-issues-since:${cursor}` : "no-issues-in-window",
    });
    await appendAuditLog([entry]);
    return NextResponse.json({
      status: "ok",
      mode: config.mode,
      filed: 0,
      wouldFile: 0,
      deduped: 0,
      errors: 0,
      scanned: rawCount,
      audit: [entry],
    });
  }

  // Per-issue loop. Budget for this run:
  //   - At most (maxPerHour - filedThisHour) writes
  //   - At most (maxPerDay - filedThisDay) writes
  // Plus, even in shadow mode, we cap the total AI calls to the same
  // number so a runaway Sentry burst can't burn the daily token budget.
  const writeBudgetThisRun = Math.max(
    0,
    Math.min(config.maxPerHour - counters.filedThisHour, config.maxPerDay - counters.filedThisDay),
  );
  const audit: AuditEntry[] = [];
  let filed = 0;
  let wouldFile = 0;
  let deduped = 0;
  let errors = 0;
  let tokensSpent = 0;

  for (const issue of issues) {
    if (filed + wouldFile >= writeBudgetThisRun) {
      audit.push(
        newAuditEntry({
          decision: "guardrail-block",
          mode: config.mode,
          reason: "per-run-budget-exhausted",
          sentryShortId: issue.shortId,
          sentryUrl: issue.permalink,
          details: { writeBudgetThisRun, filed, wouldFile },
        }),
      );
      break;
    }

    const fingerprint = buildFingerprint(issue);
    const fpLabel = fingerprintLabel(fingerprint);

    // Guardrail 4 — idempotency. JQL search for the fingerprint label
    // OR fingerprint substring in description text. Throttle ≥1s
    // between Atlassian calls per `docs/agents/issue-tracker.md`.
    await sleep(1100);
    let existingKey: string | null = null;
    try {
      existingKey = await searchExistingDraft(jiraConfig, fpLabel, fingerprint);
    } catch (error) {
      errors += 1;
      audit.push(
        newAuditEntry({
          decision: "jira-error",
          mode: config.mode,
          reason: error instanceof Error ? error.message : "Jira search failed",
          sentryShortId: issue.shortId,
          fingerprint,
        }),
      );
      continue;
    }

    if (existingKey) {
      deduped += 1;
      audit.push(
        newAuditEntry({
          decision: "dedup",
          mode: config.mode,
          reason: "fingerprint-already-filed",
          sentryShortId: issue.shortId,
          sentryUrl: issue.permalink,
          fingerprint,
          matchedKey: existingKey,
        }),
      );
      continue;
    }

    // Generate description (Haiku, or deterministic fallback).
    const epic = routeToEpic(issue);
    let draft: DraftDescription;
    if (config.anthropicApiKey && counters.tokensSpentToday + tokensSpent < config.maxTokensPerDay) {
      try {
        draft = await generateDraftDescription(issue, epic.tag, fingerprint, config.anthropicApiKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI generation failed";
        audit.push(
          newAuditEntry({
            decision: "ai-error",
            mode: config.mode,
            reason: message,
            sentryShortId: issue.shortId,
            fingerprint,
          }),
        );
        draft = buildFallbackDescription(issue);
      }
    } else {
      draft = buildFallbackDescription(issue);
    }
    tokensSpent += draft.tokensUsed || 0;

    // Shadow mode: log what we WOULD have filed but do not write.
    if (config.mode === "shadow") {
      wouldFile += 1;
      audit.push(
        newAuditEntry({
          decision: "would-file",
          mode: config.mode,
          reason: "shadow-mode",
          sentryShortId: issue.shortId,
          sentryUrl: issue.permalink,
          fingerprint,
          tokensUsed: draft.tokensUsed,
          details: {
            summary: draft.summary,
            descriptionPreview: draft.description.slice(0, 280),
            epic: epic.key,
            source: draft.source,
          },
        }),
      );
      continue;
    }

    // Live mode: file the Jira draft.
    try {
      await sleep(1100);
      const createdKey = await createCoworkDraft(jiraConfig, {
        summary: draft.summary,
        description: draft.description,
        epicKey: epic.key,
        fingerprintLabel: fpLabel,
      });
      filed += 1;
      await recordFiledTicket();
      audit.push(
        newAuditEntry({
          decision: "filed",
          mode: config.mode,
          reason: "new-fingerprint",
          sentryShortId: issue.shortId,
          sentryUrl: issue.permalink,
          fingerprint,
          jiraKey: createdKey,
          tokensUsed: draft.tokensUsed,
          details: { epic: epic.key, source: draft.source },
        }),
      );
    } catch (error) {
      errors += 1;
      audit.push(
        newAuditEntry({
          decision: "jira-error",
          mode: config.mode,
          reason: error instanceof Error ? error.message : "Jira create failed",
          sentryShortId: issue.shortId,
          fingerprint,
        }),
      );
    }
  }

  if (tokensSpent > 0) {
    await recordTokenSpend(tokensSpent, startedAt);
  }

  // Advance cursor to the MAX firstSeen across the returned batch.
  //
  // The fetch query uses `is:unresolved firstSeen:>${cursor}` (see
  // fetchSentryIssues), so the cursor MUST be tracked in firstSeen
  // units. Using `issues[0].lastSeen` was a bug — Sentry sorts issues
  // by lastSeen DESC by default, so `issues[0]` is "most recently seen"
  // but its `firstSeen` can be older than other issues' `firstSeen` in
  // the same batch. Advancing the cursor to that lastSeen would then
  // skip any issue whose firstSeen is BETWEEN the previous cursor and
  // the chosen lastSeen — forever, because the query filter wouldn't
  // match them on the next run either. (Review finding by John,
  // 2026-05-15.)
  //
  // Taking the max firstSeen across the batch ensures every issue in
  // this batch was strictly newer than the previous cursor, and the
  // next run only sees issues with firstSeen strictly greater than the
  // newest one we just processed. No skipping.
  const maxFirstSeen = issues.reduce<string | null>((max, issue) => {
    if (!issue.firstSeen) return max;
    return max === null || issue.firstSeen > max ? issue.firstSeen : max;
  }, null);
  if (maxFirstSeen) {
    await writeSentryCursor(maxFirstSeen);
  }

  await appendAuditLog(audit);
  for (const entry of audit) {
    console.log("[cowork:run]", JSON.stringify(entry));
  }

  return NextResponse.json({
    status: "ok",
    mode: config.mode,
    filed,
    wouldFile,
    deduped,
    errors,
    scanned: issues.length,
    audit,
  });
}

// JQL: look for any ticket carrying the per-fingerprint label. We also
// fall back to a description-text search in case the label was stripped
// by hand. The labelled search is the fast path; the text search uses
// `text ~` which is full-text indexed.
async function searchExistingDraft(
  jiraConfig: { baseUrl: string; email: string; token: string },
  fpLabel: string,
  fingerprint: string,
): Promise<string | null> {
  const jql = `project = BDEV AND (labels = "${fpLabel}" OR text ~ "${fingerprint}") ORDER BY created DESC`;
  const path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,labels&maxResults=1`;
  const result = await jiraFetch<{ issues?: Array<{ key?: string }> }>(jiraConfig, path);
  const first = result.issues?.[0];
  return first?.key || null;
}

async function createCoworkDraft(
  jiraConfig: { baseUrl: string; email: string; token: string },
  input: {
    summary: string;
    description: string;
    epicKey: string;
    fingerprintLabel: string;
  },
): Promise<string> {
  const body = {
    fields: {
      project: { key: "BDEV" },
      summary: input.summary,
      issuetype: { name: "Task" },
      priority: { name: "Medium" },
      parent: { key: input.epicKey },
      labels: [COWORK_LABEL_DRAFT, input.fingerprintLabel],
      description: descriptionToAdf(input.description),
    },
  };

  const response = await fetch(`${jiraConfig.baseUrl}/rest/api/3/issue`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(`Jira create returned ${response.status}: ${detail.slice(0, 200)}`);
  }
  const parsed = (await response.json()) as { key?: string };
  if (!parsed.key) {
    throw new Error("Jira create returned no key");
  }
  return parsed.key;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

// Minimal ADF builder. We map `## heading` to ADF heading nodes,
// `- bullet` to bulletList, and everything else to paragraphs with
// hardBreaks. Acceptance "- [ ]" lines become taskList items so they
// render as Jira checkboxes.
function descriptionToAdf(text: string): Record<string, unknown> {
  const lines = (text || "").split(/\r?\n/);
  const content: Array<Record<string, unknown>> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: line.slice(3).trim() }],
      });
      i += 1;
      continue;
    }

    // Task list: lines like "- [ ] ..." or "- [x] ..."
    if (/^- \[[\sxX]\]\s/.test(line)) {
      const items: Array<Record<string, unknown>> = [];
      while (i < lines.length && /^- \[[\sxX]\]\s/.test(lines[i])) {
        const m = lines[i].match(/^- \[([\sxX])\]\s(.*)$/);
        const checked = m && /[xX]/.test(m[1]);
        const taskText = m ? m[2] : lines[i];
        items.push({
          type: "taskItem",
          attrs: { state: checked ? "DONE" : "TODO", localId: `t${i}` },
          content: [{ type: "paragraph", content: [{ type: "text", text: taskText }] }],
        });
        i += 1;
      }
      content.push({
        type: "taskList",
        attrs: { localId: `tl${i}` },
        content: items,
      });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: Array<Record<string, unknown>> = [];
      while (i < lines.length && lines[i].startsWith("- ") && !/^- \[[\sxX]\]\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: lines[i].slice(2).trim() }],
            },
          ],
        });
        i += 1;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Default: paragraph until blank line.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      para.push(lines[i]);
      i += 1;
    }
    const paraContent: Array<Record<string, unknown>> = [];
    para.forEach((p, idx) => {
      if (idx > 0) paraContent.push({ type: "hardBreak" });
      paraContent.push({ type: "text", text: p });
    });
    content.push({ type: "paragraph", content: paraContent });
  }

  return {
    type: "doc",
    version: 1,
    content: content.length
      ? content
      : [{ type: "paragraph", content: [{ type: "text", text: text || "" }] }],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// re-export for tests if needed
export const __test__ = { searchExistingDraft, createCoworkDraft, descriptionToAdf };
