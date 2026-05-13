import { NextResponse } from "next/server";
import {
  editJiraIssueFields,
  getJiraTicketChecklist,
  normalizeIssueKey,
  postJiraComment,
  readJiraConfig,
  type AgentTestUpdateViewModel,
} from "@/lib/mvp-ticket-checklist";
import {
  buildFindingsSystemPrompt,
  buildFindingsUserPayload,
  buildHumanTestResultComment,
  buildLocalVerdictFallback,
  getCachedVerdict,
  hashFindings,
  parseFindingsVerdict,
  setCachedVerdict,
  type FindingsVerdict,
  type FindingsVerdictInput,
} from "@/lib/findings-verdict";
import { fetchSentryIssueSnapshots } from "@/lib/sentry-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Transition ids on the BDEV workflow. The "Mark verified" transition
// has a regex validator that requires one of: commit hash, build SHA,
// "skip:", build N, deployed, smoke trace passed — so the verification
// comment built for it MUST contain `build <N>` or a commit SHA. The
// findings comment built here already does, via buildHumanTestResultComment.
const TRANSITION_MARK_DONE = "3";
const TRANSITION_REOPEN = "4";

// Sonnet 4.6 is the AI judge here — better at conservative reasoning
// than haiku (which the coach uses). Roughly 10s end-to-end on a typical
// findings payload at the time of writing.
const FINDINGS_MODEL = "anthropic/claude-sonnet-4.6";
// Sonnet vision calls take materially longer than text-only — bumped
// from 15s so a screenshot-bearing verdict has room to land.
const FINDINGS_TIMEOUT_MS = 45000;

type FindingsPayload = {
  issue?: string;
  issueKey?: string;
  access?: string;
  findings?: string;
  evidence?: string;
  surfacePassFail?: Record<string, boolean | null>;
  // Optional metadata for files the client just uploaded via
  // /findings-attachments. The route fetches each image (server-side,
  // with Jira auth) and base64-inlines it into the Sonnet call so the
  // model can actually see the screenshot when grading pass/fail.
  attachments?: Array<{
    filename: string;
    content: string;
    mimeType: string;
    size?: number;
  }>;
};

// Sonnet vision caps the per-image request size aggressively. We refuse to
// inline anything bigger than this and let it pass through as a URL link
// only (Sonnet still sees the filename in the text evidence).
const MAX_IMAGE_INLINE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_VERDICT = 4;

type FindingsResponse =
  | {
      status: "ready";
      verdict: FindingsVerdict;
      postedCommentId: string;
      buildOrCommit: string;
      transitions: {
        markDone: { transitionId: string };
        reopen: { transitionId: string };
      };
      cached: boolean;
      source: "openrouter" | "local-fallback";
      // Populated when the verdict landed but a best-effort Jira write
      // (HFR reset, ATU override comment) failed. The detail page
      // surfaces this so the user knows the queue may not reflect the
      // new state without manual cleanup.
      partialFailures?: string[];
    }
  | { status: "error"; message: string };

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access?: string): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function POST(request: Request): Promise<NextResponse<FindingsResponse>> {
  let payload: FindingsPayload;
  try {
    payload = (await request.json()) as FindingsPayload;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send a JSON body with at least an issue key and findings." },
      { status: 400 },
    );
  }

  if (!isAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue || payload.issueKey);
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
      { status: 400 },
    );
  }

  const findings = (payload.findings || "").trim();
  if (!findings) {
    return NextResponse.json(
      { status: "error", message: "Write what happened on the phone before submitting." },
      { status: 400 },
    );
  }
  const evidence = (payload.evidence || "").trim();

  // Early-fail if Jira isn't configured BEFORE we burn an OpenRouter
  // call. If we ran Sonnet first and Jira was missing, the verdict
  // would be computed (billed) then discarded with a 503.
  const earlyJiraConfig = readJiraConfig();
  if ("missingEnv" in earlyJiraConfig) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured on the server." },
      { status: 503 },
    );
  }

  // Server-side reload of the ticket so we judge against the canonical
  // Jira state, not a stale client-side cache. Also gives us the
  // pre-computed acceptance criteria / Agent Test Update for the
  // verdict prompt.
  const checklist = await getJiraTicketChecklist(issueKey);
  if (checklist.status !== "ready") {
    return NextResponse.json({ status: "error", message: checklist.message }, { status: 502 });
  }

  const data = checklist.data;
  const buildOrCommit =
    data.humanTestPlan.agentUpdate.buildOrCommit || data.customFields.verifiedBuildOrCommit || "";

  // Dedupe accidental double-submits on the same findings within 30s.
  // Attachment filenames + sizes are folded into the cache key — without
  // this, a re-submit with a screenshot would return the cached
  // text-only verdict and skip Sonnet vision entirely.
  const attachmentSignature = (payload.attachments || [])
    .map((a) => `${a.filename || ""}:${a.size || 0}:${(a.mimeType || "").toLowerCase()}`)
    .sort()
    .join("|");
  const surfaceSignature = JSON.stringify(payload.surfacePassFail || {});
  const cacheKey = `${issueKey}:${hashFindings(findings, evidence)}:${attachmentSignature}:${surfaceSignature}`;
  const now = Date.now();
  const cached = getCachedVerdict(cacheKey, now);
  if (cached && typeof cached === "object" && "verdict" in (cached as Record<string, unknown>)) {
    const cachedBody = cached as Omit<Extract<FindingsResponse, { status: "ready" }>, "cached">;
    return NextResponse.json({ ...cachedBody, cached: true });
  }

  // Sentry IDs come from two places: anything the user pasted into
  // evidence, plus the Sentry-watch IDs the AI's plan already flagged.
  // The union goes to Sonnet so the grading sees both what the human
  // captured and what the AI said to watch for.
  const sentryIdsFromUser = extractSentryIdsLoose(evidence);
  const sentryIdsFromPlan = data.humanTestPlan.agentUpdate.sentryWatchIds || [];
  const sentryIds = Array.from(new Set([...sentryIdsFromUser, ...sentryIdsFromPlan]));

  // Live Sentry snapshot — only when env is configured. We inject it
  // into the evidence text Sonnet sees BEFORE building the verdict input
  // so it's part of the same payload, not a sidecar field. When Sentry
  // isn't configured (or the fetch fails) we silently fall back to the
  // text-only evidence.
  let augmentedEvidence = evidence;
  let sentrySnapshotLines = "";
  if (sentryIds.length > 0) {
    const snapshot = await fetchSentryIssueSnapshots(sentryIds);
    if (snapshot.status === "ready" && snapshot.issues.length > 0) {
      sentrySnapshotLines = [
        "Live Sentry status (fetched at verdict time):",
        ...snapshot.issues.map((issue) => `- ${issue.evidenceLine}`),
        ...(snapshot.misses.length
          ? [`- (missed: ${snapshot.misses.join("; ")})`]
          : []),
      ].join("\n");
      augmentedEvidence = [augmentedEvidence, sentrySnapshotLines].filter(Boolean).join("\n\n");
    }
  }

  const surfacePassFail = normaliseSurfacePassFail(payload.surfacePassFail);
  const verdictInput: FindingsVerdictInput = {
    issueKey,
    summary: data.summary,
    acceptanceCriteria: data.workRecipe.acceptanceQuestions.join("\n"),
    agentTestUpdate: summariseAgentTestUpdate(data.humanTestPlan.agentUpdate),
    buildOrCommit,
    findings,
    evidence: augmentedEvidence,
    surfacePassFail,
    sentryIds,
  };

  // Best-effort fetch of attached screenshots so Sonnet can grade against
  // what the human actually saw. Non-fatal — if any image fails to
  // download (auth, network), we keep going with the text-only payload.
  const inlineImages = await fetchAttachmentImagesForVerdict(payload.attachments);

  let verdict: FindingsVerdict;
  let source: "openrouter" | "local-fallback" = "local-fallback";
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (openRouterApiKey) {
    try {
      verdict = await callOpenRouter(verdictInput, openRouterApiKey, inlineImages);
      source = "openrouter";
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Findings verdict OpenRouter call failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      verdict = buildLocalVerdictFallback(verdictInput);
    }
  } else {
    verdict = buildLocalVerdictFallback(verdictInput);
  }

  // Build the structured Human Test Result comment and post it to Jira.
  // If Jira POST fails (e.g. token missing on dev), we still return the
  // verdict to the client — the human can copy/paste it manually if
  // needed, but the UI will surface the error.
  const verifierName = process.env.JIRA_EMAIL || "Buddy";
  const commentText = buildHumanTestResultComment({
    buildOrCommit,
    outcome: verdict.verdict,
    verifier: verifierName,
    findings,
    // The Jira comment carries the same augmented evidence Sonnet saw
    // so anyone reading the ticket later sees the same Sentry snapshot
    // the AI based its verdict on.
    evidence: augmentedEvidence,
    aiVerdict: verdict,
  });

  // jiraConfig was already validated near the top of the handler, but
  // re-narrow for TypeScript so the postJiraComment call types correctly.
  const jiraConfig = earlyJiraConfig;
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured on the server." },
      { status: 503 },
    );
  }
  let postedCommentId = "";

  try {
    postedCommentId = await postJiraComment(jiraConfig, issueKey, commentText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting the comment failed.";
    return NextResponse.json({ status: "error", message }, { status: 502 });
  }

  // When the verdict is fail or inconclusive, immediately reflect that
  // in Jira state so the queue / detail page don't keep showing the
  // ticket as Ready for you. The user can still click Mark Done /
  // Reopen / Need more info — but the fields are honest in the meantime.
  // All writes are best-effort: a failure here logs (in every env) but
  // doesn't fail the verdict response, since the Human Test Result
  // comment is already posted. The response carries `partialFailures`
  // so the UI can surface a "queue may not have updated" warning.
  const findingsPartialFailures: string[] = [];
  if (verdict.verdict === "fail" || verdict.verdict === "inconclusive") {
    // Inconclusive ≠ failed verification. Setting HFR=Failed for an
    // inconclusive verdict would tell the queue the ticket failed when
    // really it's "needs more info" — drop it to Not Ready instead so
    // someone can re-test once the conditions improve.
    const targetHfr = verdict.verdict === "inconclusive" ? "Not Ready" : "Failed";
    try {
      await editJiraIssueFields(jiraConfig, issueKey, {
        customfield_10046: { value: targetHfr },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[findings route] HFR=${targetHfr} write failed for ${issueKey}:`, message);
      findingsPartialFailures.push(`Could not update Human Final Review to ${targetHfr}: ${message}`);
    }

    // Override the prior "Agent testing: passed" so scanComments's
    // most-recent-ATU-wins rule flips agentTestUpdateStatus accordingly.
    // We label it as fail/inconclusive to match the Sonnet verdict —
    // this isn't the AI saying its code broke, it's the human-verified
    // outcome being recorded against the AI's "passed" claim.
    try {
      const override = buildHumanVerdictAtuOverride({
        verdict: verdict.verdict,
        buildOrCommit,
        reasoning: verdict.reasoning,
        findingsCommentId: postedCommentId,
      });
      await postJiraComment(jiraConfig, issueKey, override);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[findings route] ATU override post failed for ${issueKey}:`, message);
      findingsPartialFailures.push(`Could not post the Agent Test Update override comment: ${message}`);
    }
  }

  const body: Extract<FindingsResponse, { status: "ready" }> = {
    status: "ready",
    verdict,
    postedCommentId,
    buildOrCommit,
    transitions: {
      markDone: { transitionId: TRANSITION_MARK_DONE },
      reopen: { transitionId: TRANSITION_REOPEN },
    },
    cached: false,
    source,
    partialFailures: findingsPartialFailures.length ? findingsPartialFailures : undefined,
  };

  setCachedVerdict(cacheKey, body, now);
  return NextResponse.json(body);
}

type InlineImage = { filename: string; mimeType: string; dataUrl: string };

async function callOpenRouter(
  input: FindingsVerdictInput,
  apiKey: string,
  inlineImages: InlineImage[] = [],
): Promise<FindingsVerdict> {
  // When the user attached screenshots, send the verdict request as a
  // multimodal user message — Sonnet 4.6 supports images via OpenRouter's
  // OpenAI-compatible image_url content type. Text only when no images
  // were attached, so the simple JSON payload still goes through.
  const textPart = buildFindingsUserPayload(input);
  const userContent =
    inlineImages.length > 0
      ? [
          { type: "text", text: textPart },
          ...inlineImages.map((image) => ({
            type: "image_url",
            image_url: { url: image.dataUrl },
          })),
          {
            type: "text",
            text: `\nImage attachments above (in order): ${inlineImages
              .map((image) => image.filename)
              .join(", ")}. Use them to confirm or refute the typed findings.`,
          },
        ]
      : textPart;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: createTimeoutSignal(FINDINGS_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3049",
      "X-OpenRouter-Title": "HeyBlip Buddy Findings Verdict",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_FINDINGS_MODEL || FINDINGS_MODEL,
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildFindingsSystemPrompt() },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status} ${response.statusText}.`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const message = body.choices?.[0]?.message;
  let text = "";
  if (message && typeof message.content === "string") {
    text = message.content;
  } else if (message && Array.isArray(message.content)) {
    text = message.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = (part as { text?: unknown }).text;
        return typeof value === "string" ? value : "";
      })
      .join("");
  }
  if (!text.trim()) {
    throw new Error("OpenRouter returned no usable text.");
  }
  return parseFindingsVerdict(text);
}

// Pulls down image attachments from Jira and base64-inlines them so the
// Sonnet vision call can actually see the screenshot the human just
// dropped. Auth-gated — we use the same Basic credentials the rest of
// this route relies on. Non-fatal: any image that fails to fetch (or
// blows the size limit) is silently dropped so the verdict request can
// still go through with the remaining ones plus the text payload.
async function fetchAttachmentImagesForVerdict(
  attachments: FindingsPayload["attachments"],
): Promise<InlineImage[]> {
  if (!attachments || attachments.length === 0) return [];
  const images = attachments
    .filter((entry) => entry && typeof entry.mimeType === "string" && entry.mimeType.startsWith("image/"))
    .slice(0, MAX_IMAGES_PER_VERDICT);
  if (images.length === 0) return [];

  const config = readJiraConfig();
  if ("missingEnv" in config) return [];
  const authHeader = `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;

  // Parallel fetch so 4 images don't cost 4× the latency. Each gets its
  // own 6s window; any that miss the window or fail auth are dropped
  // silently and the verdict still goes through with the rest.
  const settled = await Promise.allSettled(
    images.map(async (entry): Promise<InlineImage | null> => {
      if (!entry.content) return null;
      if (typeof entry.size === "number" && entry.size > MAX_IMAGE_INLINE_BYTES) return null;
      const response = await fetch(entry.content, {
        headers: { Authorization: authHeader, Accept: entry.mimeType },
        signal: createTimeoutSignal(6000),
      });
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_INLINE_BYTES) return null;
      return {
        filename: entry.filename,
        mimeType: entry.mimeType,
        dataUrl: `data:${entry.mimeType};base64,${buffer.toString("base64")}`,
      };
    }),
  );
  const fetched: InlineImage[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) fetched.push(result.value);
  }
  return fetched;
}

// Posted when the Sonnet verdict comes back fail/inconclusive. Same
// shape as the transition-route reopen override, but tied to the
// findings-submit step (no status transition has happened yet — the
// user might still pick Need more info or Mark Done). scanComments
// picks this up as the most-recent ATU so agentTestUpdateStatus flips
// off "passed".
function buildHumanVerdictAtuOverride(input: {
  verdict: "fail" | "inconclusive";
  buildOrCommit: string;
  reasoning: string;
  findingsCommentId: string;
}): string {
  const lines = [
    `Agent Test Update — Human verification ${input.verdict}`,
    "",
    `Agent testing: ${input.verdict === "fail" ? "failed" : "inconclusive"}`,
    input.buildOrCommit ? `Build/commit: ${input.buildOrCommit}` : "",
    "Human verification needed: yes",
    "",
    "Reason (from AI verdict on human findings):",
    input.reasoning || "(no reasoning recorded — see the Human Test Result comment above)",
    "",
    "Status reset by Buddy:",
    "- Human Final Review: Failed",
    `- Agent testing classification: ${input.verdict === "fail" ? "failed" : "inconclusive"} (overrides any earlier "passed" claim)`,
    "",
    input.findingsCommentId
      ? `Findings comment id: ${input.findingsCommentId}`
      : "See the Human Test Result comment above for the full findings + AI verdict.",
  ].filter(Boolean);
  return lines.join("\n");
}

function summariseAgentTestUpdate(agentUpdate: AgentTestUpdateViewModel): string {
  if (!agentUpdate || !agentUpdate.found) return "";
  const lines: string[] = [];
  lines.push(`Status: ${agentUpdate.label}`);
  if (agentUpdate.buildOrCommit) lines.push(`Build/commit: ${agentUpdate.buildOrCommit}`);
  if (agentUpdate.humanTestRequested) {
    lines.push(`What the AI asked the human to test: ${agentUpdate.humanTestRequested}`);
  }
  if (agentUpdate.evidence?.length) {
    lines.push(`Evidence bullets: ${agentUpdate.evidence.join("; ")}`);
  }
  const surfaces = agentUpdate.surfaceResults;
  if (surfaces) {
    lines.push(
      `Surface results: automated=${surfaces.automated}, simulator=${surfaces.simulator}, worker-smoke=${surfaces.workerSmoke}`,
    );
  }
  return lines.join("\n");
}

function normaliseSurfacePassFail(
  raw: Record<string, boolean | null> | undefined,
): { label: string; value: "pass" | "fail" | "unknown" }[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).map(([label, value]) => ({
    label,
    value: value === true ? "pass" : value === false ? "fail" : "unknown",
  }));
}

function extractSentryIdsLoose(text: string): string[] {
  // Mirrors the lib parser but is intentionally local — we don't want
  // the API route to drag in the file-private helper.
  const matches = text.match(/\b[A-Z][A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?\b/g) || [];
  return Array.from(
    new Set(
      matches.filter(
        (id) => /IOS|ANDROID|JS|SENTRY/i.test(id) && !id.startsWith("BDEV-"),
      ),
    ),
  );
}
