// Cowork v1 — reject a draft.
//
// Adds the `cowork-rejected` label, removes `cowork-draft`, and posts a
// rejection-reason comment so future Cowork runs can learn (and the
// fingerprint-label dedup keeps the ticket from being re-filed). Does
// NOT auto-transition the ticket to Done — per the BDEV workflow rules,
// only PM/Cowork or a verifier may close tickets, and Cowork v1 has
// tiered authority that does NOT include transitions. The operator can
// close the rejected ticket manually in Jira.

import { NextResponse } from "next/server";
import {
  postJiraComment,
  readJiraConfig,
  normalizeIssueKey,
} from "@/lib/mvp-ticket-checklist";
import {
  COWORK_LABEL_DRAFT,
  COWORK_LABEL_REJECTED,
  appendAuditLog,
  isCoworkAccessAllowed,
  newAuditEntry,
} from "@/lib/cowork";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RejectPayload = {
  issue?: string;
  issueKey?: string;
  reason?: string;
  access?: string;
};

type RejectResponse =
  | { status: "ready"; issueKey: string }
  | { status: "error"; message: string };

export async function POST(request: Request): Promise<NextResponse<RejectResponse>> {
  let payload: RejectPayload;
  try {
    payload = (await request.json()) as RejectPayload;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send a JSON body with an issue key." },
      { status: 400 },
    );
  }

  if (!isCoworkAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue || payload.issueKey);
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
      { status: 400 },
    );
  }

  const reason = (payload.reason || "").trim().slice(0, 500);

  const jiraConfig = readJiraConfig();
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured on the server." },
      { status: 503 },
    );
  }

  let currentLabels: string[] = [];
  try {
    const res = await fetch(
      `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=labels`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${jiraConfig.email}:${jiraConfig.token}`,
          ).toString("base64")}`,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Jira returned ${res.status}`);
    }
    const body = (await res.json()) as { fields?: { labels?: string[] } };
    currentLabels = Array.isArray(body.fields?.labels) ? body.fields!.labels! : [];
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to read ticket labels.",
      },
      { status: 502 },
    );
  }

  const nextLabels = Array.from(
    new Set([...currentLabels.filter((l) => l !== COWORK_LABEL_DRAFT), COWORK_LABEL_REJECTED]),
  );

  try {
    const res = await fetch(
      `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${jiraConfig.email}:${jiraConfig.token}`,
          ).toString("base64")}`,
        },
        body: JSON.stringify({ fields: { labels: nextLabels } }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Jira returned ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to update labels.",
      },
      { status: 502 },
    );
  }

  try {
    const commentText = [
      "Cowork v1 (BDEV-510) — operator rejected this draft.",
      `Reason: ${reason || "(no reason given)"}`,
      "",
      "Cowork will not re-file this fingerprint. To re-open, remove the `cowork-rejected` label and add `cowork-draft` back, or file a new ticket manually.",
    ].join("\n");
    await postJiraComment(jiraConfig, issueKey, commentText);
  } catch {
    // Comment failure is non-fatal.
  }

  await appendAuditLog([
    newAuditEntry({
      decision: "skipped",
      mode: "n/a",
      reason: `operator-rejected:${reason || "no-reason"}`,
      jiraKey: issueKey,
      details: { labels: nextLabels },
    }),
  ]);

  return NextResponse.json({ status: "ready", issueKey });
}
