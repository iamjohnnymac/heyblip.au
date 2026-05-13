import { NextResponse } from "next/server";
import {
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
  const cacheKey = `${issueKey}:${hashFindings(findings, evidence)}`;
  const now = Date.now();
  const cached = getCachedVerdict(cacheKey, now);
  if (cached && typeof cached === "object" && "verdict" in (cached as Record<string, unknown>)) {
    const cachedBody = cached as Omit<Extract<FindingsResponse, { status: "ready" }>, "cached">;
    return NextResponse.json({ ...cachedBody, cached: true });
  }

  const sentryIds = extractSentryIdsLoose(evidence);
  const surfacePassFail = normaliseSurfacePassFail(payload.surfacePassFail);
  const verdictInput: FindingsVerdictInput = {
    issueKey,
    summary: data.summary,
    acceptanceCriteria: data.workRecipe.acceptanceQuestions.join("\n"),
    agentTestUpdate: summariseAgentTestUpdate(data.humanTestPlan.agentUpdate),
    buildOrCommit,
    findings,
    evidence,
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
    evidence,
    aiVerdict: verdict,
  });

  const jiraConfig = readJiraConfig();
  let postedCommentId = "";
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      {
        status: "error",
        message: "Jira is not configured on the server, so this comment can't be posted.",
      },
      { status: 503 },
    );
  }

  try {
    postedCommentId = await postJiraComment(jiraConfig, issueKey, commentText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting the comment failed.";
    return NextResponse.json({ status: "error", message }, { status: 502 });
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
