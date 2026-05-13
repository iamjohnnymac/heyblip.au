import { NextResponse } from "next/server";
import {
  getJiraTicketChecklist,
  normalizeIssueKey,
  postJiraComment,
  readJiraConfig,
} from "@/lib/mvp-ticket-checklist";
import {
  buildGenerateSummarySystemPrompt,
  buildGenerateSummaryUserPayload,
  getCachedGeneration,
  inferStatusMode,
  looksLikeAgentTestUpdate,
  setCachedGeneration,
  unwrapOuterCodeFence,
  type GenerateSummaryInput,
} from "@/lib/generate-summary-prompt";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Sonnet 4.6 — same model the findings verdict uses. Conservative judgment
// + plain-English output, ~10s end-to-end on a typical ticket. Override
// with OPENROUTER_GENERATE_SUMMARY_MODEL if Anthropic ships a newer one.
const GENERATE_MODEL = "anthropic/claude-sonnet-4.6";
const GENERATE_TIMEOUT_MS = 30_000;

type GenerateSummaryPayload = {
  issue?: string;
  issueKey?: string;
  access?: string;
};

type GenerateSummaryResponse =
  | {
      status: "ready";
      commentId: string;
      postedAt: string;
      source: "openrouter";
      cached: boolean;
    }
  | {
      status: "exists";
      message: string;
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

export async function POST(
  request: Request,
): Promise<NextResponse<GenerateSummaryResponse>> {
  let payload: GenerateSummaryPayload;
  try {
    payload = (await request.json()) as GenerateSummaryPayload;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send a JSON body with an issue key." },
      { status: 400 },
    );
  }

  if (!isAccessAllowed(payload.access)) {
    return NextResponse.json(
      { status: "error", message: "Access key required." },
      { status: 401 },
    );
  }

  const issueKey = normalizeIssueKey(payload.issue || payload.issueKey);
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
      { status: 400 },
    );
  }

  // Dedup a double-click. Cache by issueKey only — the request body has
  // no other variation, so any second call within 30s is treated as a
  // duplicate and short-circuits without a fresh OpenRouter spend.
  const cacheKey = `generate:${issueKey}`;
  const now = Date.now();
  const cached = getCachedGeneration(cacheKey, now);
  if (
    cached
    && typeof cached === "object"
    && "status" in (cached as Record<string, unknown>)
  ) {
    const cachedBody = cached as Extract<GenerateSummaryResponse, { status: "ready" }>;
    return NextResponse.json({ ...cachedBody, cached: true });
  }

  const checklist = await getJiraTicketChecklist(issueKey);
  if (checklist.status !== "ready") {
    return NextResponse.json(
      { status: "error", message: checklist.message || "Jira lookup failed." },
      { status: 502 },
    );
  }

  const data = checklist.data;

  // Idempotency: refuse to double-post. If extractAgentTestUpdate already
  // found an "Agent Test Update" comment on the ticket, surface a 409 and
  // tell the caller to refresh — the existing summary is the truth.
  if (data.humanTestPlan.agentUpdate.found) {
    return NextResponse.json(
      {
        status: "exists",
        message: "An AI summary is already on this ticket. Refresh to see it.",
      },
      { status: 409 },
    );
  }

  const mode = inferStatusMode(data.status);
  if (mode === "in-progress" || mode === "verifying") {
    // intentional: both supported. Surface for downstream readability.
  }

  const input: GenerateSummaryInput = {
    issueKey,
    summary: data.summary,
    status: data.status,
    descriptionText: data.descriptionText,
    acceptanceCriteria: data.workRecipe.acceptanceQuestions.join("\n"),
    mvpTrack: data.customFields.mvpTrack,
    verificationSurface: data.customFields.verificationSurface,
    verifiedBuildOrCommit: data.customFields.verifiedBuildOrCommit,
    loopStage: data.customFields.loopStage,
  };

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "OpenRouter is not configured on the server, so an AI summary can't be generated.",
      },
      { status: 503 },
    );
  }

  let commentBody: string;
  try {
    commentBody = await callOpenRouter(input, openRouterApiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI call failed.";
    return NextResponse.json(
      { status: "error", message: `Buddy couldn't reach the AI: ${message}` },
      { status: 502 },
    );
  }

  const cleaned = unwrapOuterCodeFence(commentBody);
  if (!looksLikeAgentTestUpdate(cleaned)) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "AI returned an unrecognised summary. Try again — Buddy will ask for a fresh one.",
      },
      { status: 502 },
    );
  }

  const jiraConfig = readJiraConfig();
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      {
        status: "error",
        message: "Jira is not configured on the server, so this summary can't be posted.",
      },
      { status: 503 },
    );
  }

  let postedCommentId = "";
  try {
    postedCommentId = await postJiraComment(jiraConfig, issueKey, cleaned);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting the comment failed.";
    return NextResponse.json({ status: "error", message }, { status: 502 });
  }

  const body: Extract<GenerateSummaryResponse, { status: "ready" }> = {
    status: "ready",
    commentId: postedCommentId,
    postedAt: new Date().toISOString(),
    source: "openrouter",
    cached: false,
  };

  setCachedGeneration(cacheKey, body, now);
  return NextResponse.json(body);
}

async function callOpenRouter(
  input: GenerateSummaryInput,
  apiKey: string,
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: createTimeoutSignal(GENERATE_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3049",
      "X-OpenRouter-Title": "HeyBlip Buddy Generate AI Summary",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_GENERATE_SUMMARY_MODEL || GENERATE_MODEL,
      max_tokens: 1200,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildGenerateSummarySystemPrompt() },
        { role: "user", content: buildGenerateSummaryUserPayload(input) },
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
  return text;
}
