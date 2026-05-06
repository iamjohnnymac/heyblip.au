import { NextResponse } from "next/server";
import { getJiraTicketChecklist, normalizeIssueKey, type ChecklistViewModel } from "@/lib/mvp-ticket-checklist";
import { findManualBugStep, shortTestInstruction } from "@/lib/checklist-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type CoachPayload = {
  issue?: string;
  access?: string;
  currentStepIndex?: number;
};

type CoachStep = {
  label: string;
  detail: string;
};

type CoachResponse = {
  plainTitle: string;
  whereYouAre: string;
  nextMove: string;
  johnTaySteps: CoachStep[];
  agentInstructions: string[];
  jiraUpdate: string[];
  stopIf: string[];
};

type CoachSource = "kimi-sanitized" | "fallback";

const KIMI_COACH_TIMEOUT_MS = 15000;

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

type SanitizedCoachInput = {
  ticketType: string;
  jiraStatus: string;
  mvpTrack: string;
  loopStage: string;
  verificationSurfaces: string[];
  humanFinalReview: string;
  hasAgentTestUpdate: boolean;
  hasVerifiedBuildOrCommit: boolean;
  canAgentFinishAlone: boolean;
  proofAuthority: {
    level: string;
    label: string;
    agentMayClaimDone: boolean;
  };
  missingProofCount: number;
  nextLocalRule: string;
  localJohnTaySteps: CoachStep[];
  localAgentInstructions: string[];
  localJiraUpdates: string[];
  localStopReasons: string[];
  currentStep: CoachStep & {
    index: number;
    pass: string;
    fail: string;
  };
  generatedHumanSteps: Array<{
    title: string;
    owner: string;
    surface: string;
    doThis: string;
    passMeans: string;
    failMeans: string;
  }>;
  generatedProofRequirements: Array<{
    label: string;
    surface: string;
    requiredBecause: string;
    hasConcreteProof: boolean;
    detail: string;
    tickWhen: string;
  }>;
  generatedWorkRecipe: {
    risk: string;
    testingPosture: string;
    acceptanceQuestions: string[];
    reproduceSteps: string[];
    guardrails: string[];
    outOfScope: string[];
  };
  sanitizedIssueExcerpt: string;
};

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access?: string): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

export async function POST(request: Request) {
  let payload: CoachPayload;

  try {
    payload = (await request.json()) as CoachPayload;
  } catch {
    return NextResponse.json({ status: "error", message: "Send a JSON body with an issue key." }, { status: 400 });
  }

  if (!isAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue);
  if (!issueKey) {
    return NextResponse.json({ status: "error", message: "Use a Jira issue key like BDEV-494." }, { status: 400 });
  }

  const checklist = await getJiraTicketChecklist(issueKey);
  if (checklist.status !== "ready") {
    return NextResponse.json({ status: "error", message: checklist.message }, { status: 502 });
  }

  const fallback = buildFallbackCoach(checklist.data);
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (openRouterApiKey) {
    try {
      const coach = await buildKimiSanitizedCoach(checklist.data, fallback, openRouterApiKey, payload.currentStepIndex);
      return NextResponse.json({ status: "ready", source: "kimi-sanitized" satisfies CoachSource, coach });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Kimi sanitized coach failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      return NextResponse.json({
        status: "ready",
        source: "fallback",
        coach: fallback,
      });
    }
  }

  return NextResponse.json({
    status: "ready",
    source: "fallback",
    message: "OPENROUTER_API_KEY is not configured, so this is the deterministic checklist coach.",
    coach: fallback,
  });
}

function buildSanitizedCoachInput(data: ChecklistViewModel, fallback: CoachResponse, currentStepIndex?: number): SanitizedCoachInput {
  const safeCurrentStepIndex = Math.min(Math.max(currentStepIndex ?? 0, 0), Math.max(fallback.johnTaySteps.length - 1, 0));
  const currentStep = fallback.johnTaySteps[safeCurrentStepIndex] || fallback.johnTaySteps[0] || { label: "Next", detail: fallback.nextMove };
  const sourceHumanStep = data.humanTestPlan.steps[safeCurrentStepIndex];

  return {
    ticketType: data.workRecipe.kind,
    jiraStatus: data.status,
    mvpTrack: data.customFields.mvpTrack || "Not set",
    loopStage: data.customFields.loopStage || "Not set",
    verificationSurfaces: data.customFields.verificationSurface
      .split(",")
      .map((surface) => surface.trim())
      .filter(Boolean),
    humanFinalReview: data.customFields.humanFinalReview || "Not set",
    hasAgentTestUpdate: data.humanTestPlan.agentUpdate.found,
    hasVerifiedBuildOrCommit: Boolean(data.humanTestPlan.agentUpdate.buildOrCommit || data.customFields.verifiedBuildOrCommit),
    canAgentFinishAlone: data.humanTestPlan.canAgentFinishAlone,
    proofAuthority: {
      level: data.workRecipe.proofAuthority.level,
      label: data.workRecipe.proofAuthority.label,
      agentMayClaimDone: data.workRecipe.proofAuthority.agentMayClaimDone,
    },
    missingProofCount: data.proofRecipe.missingCount,
    nextLocalRule: fallback.nextMove,
    localJohnTaySteps: fallback.johnTaySteps,
    localAgentInstructions: fallback.agentInstructions,
    localJiraUpdates: fallback.jiraUpdate,
    localStopReasons: fallback.stopIf,
    currentStep: {
      index: safeCurrentStepIndex + 1,
      label: currentStep.label,
      detail: currentStep.detail,
      pass: sourceHumanStep?.passMeans || "The step is clearly complete.",
      fail: sourceHumanStep?.failMeans || "The step is missing, unclear, or still failing.",
    },
    generatedHumanSteps: data.humanTestPlan.steps.map((step) => ({
      title: sanitizeExcerpt(step.title, 100),
      owner: step.owner,
      surface: sanitizeExcerpt(step.surface, 80),
      doThis: sanitizeExcerpt(step.doThis, 220),
      passMeans: sanitizeExcerpt(step.passMeans, 180),
      failMeans: sanitizeExcerpt(step.failMeans, 180),
    })),
    generatedProofRequirements: data.proofRecipe.requirements.map((requirement) => ({
      label: sanitizeExcerpt(requirement.label, 120),
      surface: sanitizeExcerpt(requirement.surface, 80),
      requiredBecause: sanitizeExcerpt(requirement.requiredBecause, 180),
      hasConcreteProof: requirement.hasConcreteProof,
      detail: sanitizeExcerpt(requirement.detail, 220),
      tickWhen: sanitizeExcerpt(requirement.tickWhen, 180),
    })),
    generatedWorkRecipe: {
      risk: sanitizeExcerpt(data.workRecipe.risk, 220),
      testingPosture: sanitizeExcerpt(data.workRecipe.testingPosture, 220),
      acceptanceQuestions: data.workRecipe.acceptanceQuestions.map((item) => sanitizeExcerpt(item, 160)),
      reproduceSteps: data.workRecipe.reproduceSteps.map((item) => sanitizeExcerpt(item, 160)),
      guardrails: data.workRecipe.guardrails.map((item) => sanitizeExcerpt(item, 160)),
      outOfScope: data.workRecipe.outOfScope.map((item) => sanitizeExcerpt(item, 100)),
    },
    sanitizedIssueExcerpt: sanitizeExcerpt(`${data.summary}\n${data.descriptionText}`, 700),
  };
}

function sanitizeExcerpt(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-F0-9]{16,}\b/gi, "[id]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b(sk|pk|rk|ghp|xox[baprs])-[-_a-z0-9]{12,}\b/gi, "[secret]")
    .replace(/\b[A-Z]+-\d+\b/g, "[ticket]")
    .replace(/\bbuild\s*#?\s*\d+\b/gi, "build [number]")
    .replace(/\b[0-9a-f]{7,40}\b/gi, "[hash]")
    .split("\n")
    .filter((line) => !/^\s*(at\s+\S+|\d{2}:\d{2}:\d{2}|traceback|stack trace|error:.*\/)/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
}

function buildCoachInstructions(): string {
  return [
    "You are a calm HeyBlip MVP stabilization coach for non-coders.",
    "You receive sanitized ticket state only. Do not ask for raw Jira text.",
    "Explain it like you are helping a smart high-schooler test a bug.",
    "Use plain English. Avoid software jargon.",
    "Keep it short: max 4 John/Tay steps, each under 18 words.",
    "Prefer STOP/GO language when proof or build data is missing.",
    "Do not invent facts. Use only the sanitized data provided.",
    "Return valid JSON only. Do not wrap it in markdown.",
    "The JSON must contain: plainTitle, whereYouAre, nextMove, johnTaySteps, agentInstructions, jiraUpdate, stopIf.",
    "johnTaySteps must be an array of objects with label and detail. The other list fields must be arrays of strings.",
  ].join("\n");
}

async function buildKimiSanitizedCoach(
  data: ChecklistViewModel,
  fallback: CoachResponse,
  apiKey: string,
  currentStepIndex?: number,
): Promise<CoachResponse> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: createTimeoutSignal(KIMI_COACH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3049",
      "X-OpenRouter-Title": "HeyBlip MVP Checklist Coach",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5",
      max_tokens: 4000,
      temperature: 0.2,
      response_format: { type: "json_object" },
      plugins: [{ id: "response-healing" }],
      messages: [
        { role: "system", content: buildCoachInstructions() },
        { role: "user", content: JSON.stringify(buildSanitizedCoachInput(data, fallback, currentStepIndex)) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Kimi sanitized coach returned ${response.status}.`);
  }

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown; reasoning?: unknown } }> };
  const text = extractOpenRouterText(body);
  if (!text) {
    throw new Error("Kimi sanitized coach returned no text.");
  }

  const parsed = parseCoachJson(extractJsonObject(text), text);
  return normalizeCoach(parsed, fallback);
}

function extractOpenRouterText(body: { choices?: Array<{ message?: { content?: unknown; reasoning?: unknown } }> }): string {
  const message = body.choices?.[0]?.message;
  if (!message) return "";

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const text = (part as { text?: unknown; content?: unknown; value?: unknown }).text;
        const content = (part as { text?: unknown; content?: unknown; value?: unknown }).content;
        const value = (part as { text?: unknown; content?: unknown; value?: unknown }).value;
        return typeof text === "string" ? text : typeof content === "string" ? content : typeof value === "string" ? value : "";
      })
      .join("")
      .trim();
    if (parts) return parts;
  }

  return "";
}

function extractJsonObject(value: string): string {
  const trimmed = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return trimmed;
  return trimmed.slice(first, last + 1);
}

function parseCoachJson(value: string, originalText: string): CoachResponse {
  try {
    return JSON.parse(value) as CoachResponse;
  } catch (firstError) {
    const repaired = value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(repaired) as CoachResponse;
    } catch (secondError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Kimi JSON parse failed:",
          firstError instanceof Error ? firstError.message : "Unknown error",
          secondError instanceof Error ? secondError.message : "Unknown repair error",
          originalText.slice(0, 220).replace(/\s+/g, " "),
        );
      }
      throw secondError;
    }
  }
}

function buildFallbackCoach(data: ChecklistViewModel): CoachResponse {
  const agentUpdate = data.humanTestPlan.agentUpdate;
  const buildOrCommit = agentUpdate.buildOrCommit || data.customFields.verifiedBuildOrCommit;
  const agentProof = agentUpdate.found
    ? `Agent result: ${agentUpdate.label}.`
    : "Agent result: missing.";

  return {
    plainTitle: `${data.issueKey}: ${data.workRecipe.kind} test guide`,
    whereYouAre: `${data.customFields.loopStage || "No stage"} / ${data.customFields.humanFinalReview || "No review state"}. ${agentProof} Build: ${buildOrCommit || "missing"}.`,
    nextMove: data.humanTestPlan.canAgentFinishAlone
      ? "Review the agent proof. No phone test unless Jira says phones are needed."
      : agentUpdate.found && buildOrCommit
        ? "Use the named build, try the bug once, then write PASS or FAIL."
        : "Do not test yet. Get the missing agent proof/build first.",
    johnTaySteps: buildCoachSteps(data),
    agentInstructions: [
      "Test only this ticket.",
      "Post the Agent Test Update in Jira.",
      data.humanTestPlan.canAgentFinishAlone
        ? "If checks passed, say proof is ready for John/Tay."
        : "Do not say done. Say what John/Tay must test.",
    ],
    jiraUpdate: [
      "Add Agent Test Update.",
      "Fill Verified Build/Commit.",
      "Set Human Final Review to Ready.",
    ],
    stopIf: [
      "Build is missing.",
      "Agent proof is missing.",
      "You are on the wrong phone/build.",
      "The bug still happens.",
    ],
  };
}

function buildCoachSteps(data: ChecklistViewModel): CoachStep[] {
  const plan = data.humanTestPlan;
  const buildOrCommit = plan.agentUpdate.buildOrCommit || data.customFields.verifiedBuildOrCommit;
  const phoneStep = findManualBugStep(plan.steps);
  const workKind = data.workRecipe.kind;

  if (plan.canAgentFinishAlone) {
    return [
      { label: "Check proof", detail: "Make sure the agent showed real passing tests." },
      { label: "Check version", detail: buildOrCommit ? `Proof must be for ${buildOrCommit}.` : "Ask for the build or commit." },
      { label: "Mark Jira", detail: "Pass it only if the proof is complete." },
    ];
  }

  return [
    {
      label: plan.agentUpdate.found ? "Read agent result" : "Wait",
      detail: plan.agentUpdate.found ? "See what the agent already tested." : "Ask the agent to post test proof first.",
    },
    {
      label: buildOrCommit ? "Use build" : "Get build",
      detail: buildOrCommit ? `Only test ${buildOrCommit}.` : "Ask for the exact build or commit.",
    },
    {
      label: "Try bug",
      detail: shortTestInstruction(phoneStep?.doThis || data.recommendedAction.steps[0] || "Run the Jira test once.", workKind),
    },
    { label: "Write result", detail: "Comment PASS or FAIL in Jira." },
  ];
}

function normalizeCoach(value: Partial<CoachResponse>, fallback: CoachResponse): CoachResponse {
  return {
    plainTitle: value.plainTitle || fallback.plainTitle,
    whereYouAre: value.whereYouAre || fallback.whereYouAre,
    nextMove: value.nextMove || fallback.nextMove,
    johnTaySteps: normalizeSteps(value.johnTaySteps, fallback.johnTaySteps),
    agentInstructions: normalizeStrings(value.agentInstructions, fallback.agentInstructions),
    jiraUpdate: normalizeStrings(value.jiraUpdate, fallback.jiraUpdate),
    stopIf: normalizeStrings(value.stopIf, fallback.stopIf),
  };
}

function normalizeSteps(value: unknown, fallback: CoachStep[]): CoachStep[] {
  if (!Array.isArray(value)) return fallback;
  const steps = value
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const label = (step as { label?: unknown }).label;
      const detail = (step as { detail?: unknown }).detail;
      if (typeof label !== "string" || typeof detail !== "string") return null;
      return { label, detail };
    })
    .filter((step): step is CoachStep => Boolean(step));

  return steps.length ? steps : fallback;
}

function normalizeStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length ? strings : fallback;
}
