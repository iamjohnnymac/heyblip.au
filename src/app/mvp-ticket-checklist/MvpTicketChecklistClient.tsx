"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  KeyRound,
  ListChecks,
  LockKeyhole,
  MonitorSmartphone,
  MoreHorizontal,
  RefreshCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TicketCheck,
  Users,
} from "lucide-react";
import type { ChecklistViewModel, JiraChecklistResult } from "@/lib/mvp-ticket-checklist";
import { capitalizeFirst, findManualBugStep, shortTestInstruction } from "@/lib/checklist-helpers";

type AccessState = {
  status: "access-required" | "access-misconfigured";
  issueKey: string;
  dashboardUrl: string;
  message: string;
};

export type TicketChecklistPageState = JiraChecklistResult | AccessState;

type Props = {
  state: TicketChecklistPageState;
  accessParam: string;
};

type CoachStep = {
  label: string;
  detail: string;
};

type CoachPayload = {
  plainTitle: string;
  whereYouAre: string;
  nextMove: string;
  johnTaySteps: CoachStep[];
  agentInstructions: string[];
  jiraUpdate: string[];
  stopIf: string[];
};

type CoachState =
  | { status: "idle" }
  | { status: "loading"; stepIndex: number }
  | { status: "ready"; source: "kimi-sanitized" | "fallback"; message?: string; coach: CoachPayload; stepIndex: number }
  | { status: "error"; message: string };

type StudentTestStep = {
  title: string;
  body: string;
  pass: string;
  fail: string;
};

type BuildRunSummary = {
  id: number;
  status: string;
  conclusion: string | null;
  name: string;
  htmlUrl: string;
  headSha: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
};

type BuildStatusBody =
  | { status: "ready"; match: "ticket" | "preview-branch" | "latest-main" | "none"; run: BuildRunSummary | null }
  | { status: "missing-config"; match: "none"; run: null }
  | { status: "error"; match: "none"; run: null; message: string };

type BuildStatusState =
  | { kind: "idle" }
  | { kind: "ready"; body: BuildStatusBody };

const COACH_REQUEST_TIMEOUT_MS = 100000;
const BUILD_STATUS_POLL_MS = 30_000;

const loopStages = [
  "Candidate",
  "Selected",
  "Reproducing",
  "Acceptance Locked",
  "Agent Coding",
  "PR Review",
  "CI Green",
  "In Build",
  "Human Verifying",
  "Passed",
  "Failed/Reopened",
];

const textWrapStyle: CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const viewportWidthStyle: CSSProperties = {
  width: "min(100%, calc(100vw - 2rem))",
};

const surfaceNotes = [
  {
    label: "Automated",
    pattern: /automated|unit|test|worker/i,
    icon: ShieldCheck,
    detail: "Good for model logic, routing state, payload parsing, and regression locks.",
  },
  {
    label: "Simulator",
    pattern: /simulator/i,
    icon: MonitorSmartphone,
    detail: "Good for UI state, deeplinks, local notifications, badge clearing, and cold launch.",
  },
  {
    label: "Real phones",
    pattern: /one phone|two phones|testflight|apns|ble|background|relay/i,
    icon: Smartphone,
    detail: "Required for BLE, APNs/TestFlight, background wake, offline relay, and two-account behavior.",
  },
];

const emptyWorkRecipe: ChecklistViewModel["workRecipe"] = {
  kind: "Loading",
  source: "Work recipe data is refreshing. Reload the ticket if this message stays visible.",
  risk: "Recipe data is not available yet.",
  testingPosture: "Refresh the ticket to load testing posture.",
  aiOperatingModel: {
    mode: "human-alignment",
    label: "Loading operating model",
    summary: "Refresh the ticket to load the AI operating model.",
    smartZoneRule: "Refresh the ticket to load task sizing.",
    handoffRule: "Refresh the ticket to load handoff guidance.",
    promptRules: [],
    checklist: [],
  },
  proofAuthority: {
    level: "needs-surface",
    label: "Loading proof authority",
    summary: "Refresh the ticket to load proof authority.",
    agentMayClaimDone: false,
    agentDoneLanguage: "Agent may not claim done yet.",
    humanVerificationLanguage: "John/Tay should wait for the checklist to load.",
    proofRequired: [],
  },
  issueSignals: [],
  acceptanceQuestions: [],
  reproduceSteps: [],
  guardrails: [],
  closeoutEvidence: [],
  outOfScope: [],
  surfaceCards: [],
};

const emptyProofRecipe: ChecklistViewModel["proofRecipe"] = {
  foundStructuredRecipe: false,
  source: "Proof recipe data is refreshing. Reload the ticket if this message stays visible.",
  requiredSurfaces: [],
  requirements: [],
  missingCount: 0,
  template: "",
};

const emptyHumanTestPlan: ChecklistViewModel["humanTestPlan"] = {
  title: "Human test plan loading",
  summary: "Refresh the ticket to load the plain-English test plan.",
  canAgentFinishAlone: false,
  agentStatusLabel: "Loading agent status",
  humanStatusLabel: "Loading human review status",
  dashboardUpdateRule: "Refresh the ticket to load update instructions.",
  agentUpdate: {
    found: false,
    status: "unknown",
    label: "No agent update yet",
    buildOrCommit: "",
    humanVerificationNeeded: null,
    humanTestRequested: "",
    evidence: [],
    surfaceResults: {
      automated: "Not reported",
      simulator: "Not reported",
      workerSmoke: "Not reported",
    },
  },
  steps: [],
};

const fieldHelp: Record<
  string,
  {
    plain: string;
    action: string;
  }
> = {
  "customfield_10043": {
    plain: "The bucket this ticket belongs to, such as Auth, Text DM, Push/Badge, or Nearby/BLE.",
    action: "Use this to pick the right lane and stop one fix from drifting into another feature.",
  },
  "customfield_10044": {
    plain: "Where this ticket is in the stabilization loop right now.",
    action: "Move this forward one step at a time: reproduce, lock acceptance, code, review, build, verify, then pass or reopen.",
  },
  "customfield_10045": {
    plain: "The surfaces that must prove the fix, from automated checks through real phones.",
    action: "Use this to decide whether simulator is enough or whether John/Tay need TestFlight, APNs, BLE, or two-phone testing.",
  },
  "customfield_10046": {
    plain: "The human gate. This is not CI and not the agent saying it looks good.",
    action: "John/Tay set this only after the required device/build verification has actually happened.",
  },
  "customfield_10047": {
    plain: "The exact build number, PR merge SHA, or commit that was verified.",
    action: "Fill this before closing so everyone knows which build passed and can trace regressions later.",
  },
};

function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function currentStageIndex(stage: string): number {
  const normalized = stage.toLowerCase();
  const index = loopStages.findIndex((item) => normalized.includes(item.toLowerCase()));
  return index === -1 ? 0 : index;
}

function isReadyState(state: TicketChecklistPageState): state is Extract<JiraChecklistResult, { status: "ready" }> {
  return state.status === "ready";
}

function statusTone(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("passed")) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (lower.includes("progress") || lower.includes("review") || lower.includes("build")) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  }
  if (lower.includes("fail") || lower.includes("block")) return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)]";
}

function buildEmptyChecks(data: ChecklistViewModel): Record<string, boolean> {
  return Object.fromEntries(
    [
      ...buildStudentTestSteps(data).map((step, index) => [studentStepKey(index, step.title), false] as const),
      ...data.humanTestPlan.steps.map((step, index) => [humanStepKey(index, step.title), false] as const),
      ...data.checklistSections.flatMap((section) =>
        section.items.map((item) => [`${section.title}:${item.label}`, false] as const),
      ),
    ],
  );
}

function humanStepKey(index: number, title: string): string {
  return `Human Test Plan:${index}:${title}`;
}

function studentStepKey(index: number, title: string): string {
  return `Student Test Card:${index}:${title}`;
}

function buildStudentTestSteps(data: ChecklistViewModel): StudentTestStep[] {
  const plan = data.humanTestPlan;
  const buildOrCommit = plan.agentUpdate.buildOrCommit || data.customFields.verifiedBuildOrCommit;
  const phoneStep = findManualBugStep(plan.steps);
  const finalStep = plan.steps.find((step) => /pass|fail|jira|clear/i.test(step.title));
  const workKind = data.workRecipe.kind;
  const statusLower = (data.status || "").toLowerCase();
  const stageLower = (data.customFields.loopStage || "").toLowerCase();
  // "Not started" = the ticket exists but no AI has picked it up yet.
  // "In flight" = an AI is mid-work but hasn't posted a summary.
  const notStarted = !plan.agentUpdate.found && (
    statusLower === "to do" ||
    statusLower === "open" ||
    statusLower === "backlog" ||
    statusLower.includes("selected") ||
    statusLower.includes("reproducing") ||
    statusLower.includes("acceptance") ||
    stageLower.includes("candidate") ||
    stageLower.includes("selected") ||
    stageLower.includes("reproducing") ||
    stageLower.includes("acceptance")
  );

  if (plan.canAgentFinishAlone) {
    return [
      {
        title: "Check the agent proof",
        body: plan.agentUpdate.found
          ? "Make sure the agent says the automated and simulator checks passed."
          : "Ask the agent to post its test results before you sign off.",
        pass: "The agent included real commands or screenshots and they passed.",
        fail: "The proof is missing, vague, or has placeholders.",
      },
      {
        title: "Check the build",
        body: buildOrCommit ? `Make sure the proof is for ${buildOrCommit}.` : "Ask for the exact build or commit.",
        pass: "The build or commit is clearly written on Jira.",
        fail: "Nobody can tell which version was tested.",
      },
      {
        title: "Mark it in Jira",
        body: "Open the ticket. Set Human Final Review to Passed if the proof is complete, or Failed/Reopened with a comment naming what is missing.",
        pass: "Human Final Review is set, and a comment names the build/commit you reviewed.",
        fail: "Human Final Review is unchanged, or the comment does not name the build/commit.",
      },
    ];
  }

  return [
    {
      title: plan.agentUpdate.found
        ? "Read what the AI tested"
        : notStarted
          ? "Send this to an AI to start"
          : "AI is still coding this",
      body: plan.agentUpdate.found
        ? "Skim the AI's summary in Jira before you pick up a phone — it tells you what it changed and what it tested."
        : notStarted
          ? "No AI has picked this up yet. Tap a green button below to send the prompt to Codex or Claude — the AI will do the coding and post a summary back to Jira."
          : "An AI is writing the fix. When it posts a summary in Jira (a comment titled 'Agent Test Update'), this card turns green and it's your turn.",
      pass: plan.agentUpdate.found
        ? "The summary has real commands or screenshots and a build number — not [Passed / Failed] placeholders."
        : notStarted
          ? "After you send it: an AI takes the prompt, does the work, and posts a summary in Jira."
          : "The AI's summary appears in Jira with real values, not template placeholders.",
      fail: plan.agentUpdate.found
        ? "The summary is vague, missing the build, or still has [Passed / Failed] placeholders."
        : notStarted
          ? "Nobody picked it up, or they posted without filling the template properly."
          : "No summary yet, or it still has unfilled [Passed / Failed] placeholders.",
    },
    {
      title: buildOrCommit ? "Install the right build" : "Wait for the new TestFlight build",
      body: buildOrCommit
        ? `Open TestFlight on your phone, find HeyBlip Beta, and install the latest build. Look for build ${buildOrCommit} (or the highest build number) — older builds don't have the fix.`
        : "The fix needs a TestFlight build before you can test it. Either: (1) wait for the PR to merge — CI cuts a new TestFlight build automatically (5-15 mins), or (2) ask the AI to trigger a build for the PR branch directly. Once a build is named in Jira, this card turns green.",
      pass: "TestFlight has a new HeyBlip Beta build and you've installed it.",
      fail: "No new build in TestFlight yet, or you're still on an older one.",
    },
    {
      title: "Try the bug once",
      body: shortTestInstruction(phoneStep?.doThis || data.recommendedAction.steps[0] || "Run the test written on Jira.", workKind),
      pass: capitalizeFirst(phoneStep?.passMeans || "The bug no longer happens."),
      fail: capitalizeFirst(phoneStep?.failMeans || "The bug still happens, or the result is confusing."),
    },
    {
      title: "Write pass or fail",
      body: shortTestInstruction(finalStep?.doThis || "Write one Jira comment saying PASS or FAIL and what you saw.", workKind, false),
      pass: capitalizeFirst(finalStep?.passMeans || "Jira says what passed and on which build."),
      fail: capitalizeFirst(finalStep?.failMeans || "Jira says exactly what failed."),
    },
  ];
}

function buildMascotFallbackSpeech(step: StudentTestStep | undefined, humanTestPlan: ChecklistViewModel["humanTestPlan"], buildOrCommit: string): string {
  if (!step) return "All steps are ticked. Write the final evidence into Jira before closing it.";

  const title = step.title.toLowerCase();

  if (title.includes("wait") || title.includes("agent")) {
    return "Hold here. Ask the agent to post what it tested before you touch the phones.";
  }

  if (title.includes("build") || title.includes("commit")) {
    return "Hold here. Get the exact build or commit so you test the right version.";
  }

  if (title.includes("pass") || title.includes("fail") || title.includes("write")) {
    return "Write PASS or FAIL in Jira with the phone, account, build, time, and exactly what you saw.";
  }

  if (!humanTestPlan.agentUpdate.found || !buildOrCommit) {
    return `Only do this after the agent proof and build are on Jira: ${step.body}`;
  }

  return step.body;
}

function buildMascotTitle(step: StudentTestStep | undefined, index: number): string {
  if (!step) return "Loop complete";
  return `Step ${index + 1}: ${step.title}`;
}

function resultTitle(state: TicketChecklistPageState): string {
  if (state.status === "missing-config") return "Jira setup needed";
  if (state.status === "invalid-issue") return "Use a BDEV ticket key";
  if (state.status === "fetch-error") return "Jira could not load this ticket";
  if (state.status === "access-required") return "Private checklist";
  if (state.status === "access-misconfigured") return "Access key not configured";
  return "Ticket loaded";
}

type BuildChipKind = "queued" | "running" | "processing" | "success" | "failed" | "cancelled";

// Apple typically processes a TestFlight upload in 5-30 min after CI finishes.
// We show a distinct "Apple processing" state for this window so the chip
// doesn't lie ("ready" before the build is actually installable).
const APPLE_PROCESSING_MINUTES = 20;

type BuildChip = {
  kind: BuildChipKind;
  label: string;
  href: string;
  pulsing: boolean;
  matchType: "ticket" | "preview-branch" | "latest-main";
};

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes < 1) return `${remaining}s`;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function buildChipClassName(kind: BuildChipKind): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors";
  switch (kind) {
    case "queued":
    case "running":
      return `${base} border-amber-300/45 bg-amber-300/10 text-amber-100 hover:border-amber-300/70 hover:bg-amber-300/15`;
    case "processing":
      return `${base} border-amber-300/45 bg-amber-300/10 text-amber-100 hover:border-amber-300/70 hover:bg-amber-300/15`;
    case "success":
      return `${base} border-emerald-300/45 bg-emerald-300/10 text-emerald-100 hover:border-emerald-300/70 hover:bg-emerald-300/15`;
    case "failed":
      return `${base} border-red-300/45 bg-red-300/10 text-red-100 hover:border-red-300/70 hover:bg-red-300/15`;
    case "cancelled":
      return `${base} border-white/15 bg-black/30 text-white/70 hover:border-white/25 hover:bg-black/40`;
  }
}

function buildChipDotClass(kind: BuildChipKind): string {
  switch (kind) {
    case "queued":
    case "running":
    case "processing":
      return "bg-amber-200";
    case "success":
      return "bg-emerald-300";
    case "failed":
      return "bg-red-300";
    case "cancelled":
      return "bg-white/60";
  }
}

function buildChipTooltip(chip: BuildChip): string {
  const matchSuffix = chip.matchType === "preview-branch"
    ? " (preview branch run, not yet on main)"
    : chip.matchType === "latest-main"
      ? " (latest main run — no commit named this ticket yet)"
      : "";
  switch (chip.kind) {
    case "queued":
      return `TestFlight build is queued on GitHub${matchSuffix}. Click to open the run.`;
    case "running":
      return `TestFlight build is in progress${matchSuffix}. Click to open the run.`;
    case "processing":
      return `CI uploaded the build to App Store Connect. Apple is now verifying it for TestFlight (usually 5-30 min). Once it's ready you can install it on your phone.`;
    case "success":
      return `TestFlight build finished successfully${matchSuffix}. Click to open the run.`;
    case "failed":
      return `TestFlight build failed${matchSuffix}. Click to open the run.`;
    case "cancelled":
      return `TestFlight build was cancelled${matchSuffix}. Click to open the run.`;
  }
}

function deriveBuildChip(state: BuildStatusState): BuildChip | null {
  if (state.kind !== "ready") return null;
  const body = state.body;
  if (body.status !== "ready") return null;
  if (body.match === "none" || !body.run) return null;

  const previewPrefix = body.match === "preview-branch" ? "Preview " : "";
  const run = body.run;

  if (run.status === "queued") {
    return {
      kind: "queued",
      label: `${previewPrefix}Build queued`,
      href: run.htmlUrl,
      pulsing: true,
      matchType: body.match,
    };
  }

  if (run.status === "in_progress") {
    const elapsed = formatElapsed(run.durationSec);
    return {
      kind: "running",
      label: `${previewPrefix}Building · ${elapsed}`,
      href: run.htmlUrl,
      pulsing: true,
      matchType: body.match,
    };
  }

  if (run.status === "completed") {
    if (run.conclusion === "success") {
      // CI succeeded, but Apple still needs to process the upload before
      // it's installable in TestFlight. Show a distinct "processing" state
      // for the first APPLE_PROCESSING_MINUTES after CI completion.
      const completedAt = Date.parse(run.updatedAt);
      const minutesSinceComplete = Number.isFinite(completedAt)
        ? (Date.now() - completedAt) / 60_000
        : Infinity;

      if (minutesSinceComplete < APPLE_PROCESSING_MINUTES) {
        const elapsed = Math.floor(minutesSinceComplete);
        const elapsedLabel = elapsed < 1 ? "just uploaded" : `${elapsed}m`;
        return {
          kind: "processing",
          label: `${previewPrefix}Apple processing · ${elapsedLabel}`,
          href: run.htmlUrl,
          pulsing: true,
          matchType: body.match,
        };
      }

      const label = body.match === "preview-branch"
        ? "Preview build ready"
        : "Build ready in TestFlight";
      return {
        kind: "success",
        label,
        href: run.htmlUrl,
        pulsing: false,
        matchType: body.match,
      };
    }
    if (run.conclusion === "cancelled") {
      return {
        kind: "cancelled",
        label: `${previewPrefix}Build cancelled`,
        href: run.htmlUrl,
        pulsing: false,
        matchType: body.match,
      };
    }
    // failure / timed_out / startup_failure / etc. — treat as failed.
    return {
      kind: "failed",
      label: `${previewPrefix}Build failed`,
      href: run.htmlUrl,
      pulsing: false,
      matchType: body.match,
    };
  }

  return null;
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for browsers that deny clipboard permission.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export default function MvpTicketChecklistClient({ state, accessParam }: Props) {
  const data = isReadyState(state) ? state.data : null;
  const ready = Boolean(data);
  const issueKey = data?.issueKey ?? state.issueKey;
  const workRecipe = data?.workRecipe ?? emptyWorkRecipe;
  const proofRecipe = data?.proofRecipe ?? emptyProofRecipe;
  const humanTestPlan = data?.humanTestPlan ?? emptyHumanTestPlan;
  const [helperHidden, setHelperHidden] = useState(true);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [pollLastChecked, setPollLastChecked] = useState<number>(() => Date.now());
  const prevHasAgentProofRef = useRef(false);
  const prevHasBuildRef = useRef(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatusState>({ kind: "idle" });
  const prevBuildSuccessRef = useRef(false);
  const [coachState, setCoachState] = useState<CoachState>({ status: "idle" });
  const [copyResult, setCopyResult] = useState<{ id: string; status: "copied" | "failed" } | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => (data ? buildEmptyChecks(data) : {}));
  const studentSteps = useMemo(() => (data ? buildStudentTestSteps(data) : []), [data]);
  const activeStepIndex = studentSteps.findIndex((step, index) => !checks[studentStepKey(index, step.title)]);
  const currentStepIndex = activeStepIndex === -1 ? Math.max(studentSteps.length - 1, 0) : activeStepIndex;
  const currentStep = studentSteps[currentStepIndex];
  const currentStepDomId = `human-verification-step-${currentStepIndex + 1}`;
  const buildOrCommit = humanTestPlan.agentUpdate.buildOrCommit || data?.customFields.verifiedBuildOrCommit || "";
  const coachMatchesCurrentStep = coachState.status === "ready" && coachState.stepIndex === currentStepIndex;
  const mascotSpeech =
    coachState.status === "error"
      ? `${buildMascotFallbackSpeech(currentStep, humanTestPlan, buildOrCommit)} Buddy used the local guide because AI was slow.`
      : coachMatchesCurrentStep
      ? coachState.coach.nextMove
      : buildMascotFallbackSpeech(currentStep, humanTestPlan, buildOrCommit);
  const mascotSourceLabel =
    coachMatchesCurrentStep && coachState.source === "kimi-sanitized"
      ? "Kimi sanitized"
      : coachState.status === "loading" && coachState.stepIndex === currentStepIndex
        ? "Thinking"
        : "Local guide";

  const progress = useMemo(() => {
    if (!data) return 0;
    const values = studentSteps.map((step, index) => Boolean(checks[studentStepKey(index, step.title)]));
    if (!values.length) return 0;
    return Math.round((values.filter(Boolean).length / values.length) * 100);
  }, [checks, data, studentSteps]);

  async function copyToClipboard(id: string, text: string) {
    const copied = await writeClipboardText(text);

    if (copied) {
      setCopyResult({ id, status: "copied" });
    } else {
      setCopyResult({ id, status: "failed" });
    }

    window.setTimeout(() => setCopyResult(null), 1800);
  }

  function scrollToCurrentStep() {
    document.getElementById(currentStepDomId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadCoach() {
    const requestedStepIndex = currentStepIndex;
    setCoachState({ status: "loading", stepIndex: requestedStepIndex });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), COACH_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/mvp-ticket-checklist/coach", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: issueKey, access: accessParam, currentStepIndex: requestedStepIndex }),
      });

      const body = (await response.json()) as
        | { status: "ready"; source: "kimi-sanitized" | "fallback"; message?: string; coach: CoachPayload }
        | { status: "error"; message: string };

      if (!response.ok || body.status !== "ready") {
        const message = "message" in body && body.message ? body.message : "Coach could not load.";
        setCoachState({ status: "error", message });
        return;
      }

      setCoachState({ status: "ready", source: body.source, message: body.message, coach: body.coach, stepIndex: requestedStepIndex });
    } catch {
      setCoachState({ status: "error", message: "Coach could not load. Check the dev server and API key." });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const stageIndex = data ? currentStageIndex(data.customFields.loopStage) : 0;
  const surfaces = data ? splitValues(data.customFields.verificationSurface) : [];
  const realPhoneRequired = surfaces.some((surface) => /one phone|two phones|testflight|apns|ble|background|relay/i.test(surface));
  const surfaceCards = workRecipe.surfaceCards.length
    ? workRecipe.surfaceCards
    : surfaceNotes.map((note) => ({
        label: note.label,
        active: false,
        detail: note.detail,
        requiredBecause: "Waiting for Jira data",
        needsHumanDevice: false,
        agentVerifiable: false,
      }));
  const allStepsComplete = studentSteps.length > 0 && activeStepIndex === -1;
  const hasAgentProof = humanTestPlan.agentUpdate.found;
  const hasBuild = Boolean(buildOrCommit);
  const router = useRouter();
  const pollEnabled = ready && !allStepsComplete;

  useEffect(() => {
    if (!pollEnabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    function refresh() {
      if (typeof document !== "undefined" && document.hidden) return;
      setPollLastChecked(Date.now());
      router.refresh();
    }
    function onVisibility() {
      if (typeof document === "undefined" || document.hidden) return;
      if (Date.now() - pollLastChecked > 15_000) {
        refresh();
      }
    }
    timer = setInterval(refresh, 30_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [pollEnabled, router, pollLastChecked]);

  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    if (!pollEnabled) return;
    const tick = setInterval(() => setPollTick((value) => value + 1), 1000);
    return () => clearInterval(tick);
  }, [pollEnabled]);
  const pollAgeSeconds = Math.max(0, Math.floor((Date.now() - pollLastChecked) / 1000));
  const pollAgeLabel = pollAgeSeconds < 5 ? "just now" : `${pollAgeSeconds}s ago`;
  void pollTick;

  // Build-status chip — polls /api/.../build-status alongside Jira polling.
  // Pauses when the page is hidden and stops once all steps are ticked
  // (matches `pollEnabled`).
  useEffect(() => {
    if (!ready) return;
    if (!pollEnabled) return;
    let cancelled = false;
    const accessQuery = accessParam ? `&access=${encodeURIComponent(accessParam)}` : "";

    async function fetchBuildStatus() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const response = await fetch(
          `/api/mvp-ticket-checklist/build-status?issue=${encodeURIComponent(issueKey)}${accessQuery}`,
          { cache: "no-store" },
        );
        if (!response.ok && response.status !== 502) return;
        const body = (await response.json()) as BuildStatusBody;
        if (cancelled) return;
        setBuildStatus({ kind: "ready", body });
      } catch {
        // Network error — leave the previous state in place. The next poll retries.
      }
    }

    fetchBuildStatus();
    const timer = setInterval(fetchBuildStatus, BUILD_STATUS_POLL_MS);
    function onVisibility() {
      if (typeof document === "undefined" || document.hidden) return;
      fetchBuildStatus();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [ready, pollEnabled, issueKey, accessParam]);

  const buildChip = useMemo(() => deriveBuildChip(buildStatus), [buildStatus]);

  // Fire a celebration banner when the build flips to ready (success).
  useEffect(() => {
    if (!ready) return;
    const isSuccessNow = Boolean(
      buildChip && buildChip.kind === "success" && buildChip.matchType !== "latest-main",
    );
    if (isSuccessNow && !prevBuildSuccessRef.current) {
      setCelebration("✅ Build ready in TestFlight — install the latest HeyBlip Beta build.");
      const timeout = setTimeout(() => setCelebration(null), 8000);
      prevBuildSuccessRef.current = true;
      return () => clearTimeout(timeout);
    }
    if (!isSuccessNow) {
      prevBuildSuccessRef.current = false;
    }
  }, [buildChip, ready]);

  useEffect(() => {
    if (!ready) {
      prevHasAgentProofRef.current = hasAgentProof;
      prevHasBuildRef.current = hasBuild;
      return;
    }
    let message: string | null = null;
    if (!prevHasAgentProofRef.current && hasAgentProof) {
      message = "🎉 The AI just posted its summary in Jira.";
    } else if (!prevHasBuildRef.current && hasBuild) {
      message = "✅ Build is named — you can test now.";
    }
    prevHasAgentProofRef.current = hasAgentProof;
    prevHasBuildRef.current = hasBuild;
    if (message) {
      setCelebration(message);
      const timeout = setTimeout(() => setCelebration(null), 8000);
      return () => clearTimeout(timeout);
    }
  }, [hasAgentProof, hasBuild, ready]);
  const currentStepKey = currentStep ? studentStepKey(currentStepIndex, currentStep.title) : "";
  const step1LocallyTicked = studentSteps[0]
    ? Boolean(checks[studentStepKey(0, studentSteps[0].title)])
    : false;
  const step2LocallyTicked = studentSteps[1]
    ? Boolean(checks[studentStepKey(1, studentSteps[1].title)])
    : false;
  const statusCard: {
    label: string;
    body: string;
    localNote?: string;
    className: string;
  } = allStepsComplete
    ? {
        label: "Done — write the result in Jira",
        body: "All steps ticked. Paste your PASS or FAIL into Jira before closing.",
        className: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
      }
    : !hasAgentProof
      ? {
          label: "Not your turn yet — AI is still coding",
          body: "Don't pick up your phone. The AI hasn't posted a test summary yet.",
          localNote: step1LocallyTicked
            ? "You ticked step 1, but Jira still has no AI summary. Refresh to recheck."
            : undefined,
          className: "border-amber-300/35 bg-amber-300/10 text-amber-100",
        }
      : !hasBuild
        ? {
            label: "Almost there — Jira needs to name the build",
            body: "The AI posted but didn't say which build to test. Don't guess — ask for the exact build.",
            localNote: step2LocallyTicked
              ? "You ticked step 2, but Jira still has no build/commit named. Refresh to recheck."
              : undefined,
            className: "border-amber-300/35 bg-amber-300/10 text-amber-100",
          }
        : {
            label: "Ready to test",
            body: `Use ${buildOrCommit} and follow the active step below.`,
            className: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
          };
  const progressLabels = ["AI summary", "Build", "Test", "Result"].slice(0, Math.max(studentSteps.length, 1));
  const surfaceSummary = realPhoneRequired
    ? "Final pass needs the named phone/TestFlight evidence. Use simulator only for the parts that do not depend on APNs, BLE, background wake, or two-account behavior."
    : "This looks simulator-first from Jira. Use phones only if the acceptance criteria add APNs, BLE, background, or two-account delivery.";

  return (
    <main className="mesh-gradient min-h-screen max-w-[100vw] overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <section className="px-4 py-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto flex w-full max-w-[calc(100vw-2rem)] items-center justify-between gap-4 sm:max-w-7xl"
          style={viewportWidthStyle}
        >
          <Link href="/" aria-label="Blip home" className="inline-flex min-w-0 items-center">
            <Image src="/Blipwhitelogo.png" alt="Blip" width={142} height={56} className="h-12 w-auto" priority />
          </Link>
          <a
            href={state.dashboardUrl}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white sm:px-4"
          >
            <ListChecks size={17} />
            <span className="hidden sm:inline">Jira board</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div
          className="mx-auto w-full min-w-0 max-w-[calc(100vw-2rem)] rounded-3xl border border-[var(--border-strong)] bg-[var(--card-bg)] p-4 sm:max-w-7xl sm:p-7"
          style={viewportWidthStyle}
        >
          <div className="flex flex-col gap-4">
            <BuddySuggestionStrip
              accessParam={accessParam}
              currentIssueKey={data?.issueKey ?? issueKey}
              ready={ready}
            />

            {ready && data ? (
              <>
                <TicketHeaderStrip
                  issueKey={data.issueKey}
                  status={data.status}
                  summary={data.summary}
                  issueUrl={data.issueUrl}
                  onClearTicks={() => setChecks(buildEmptyChecks(data))}
                  onChangeTicket={() => {
                    const next = window.prompt("Type a BDEV key (e.g. BDEV-486)", data.issueKey);
                    if (!next) return;
                    const trimmed = next.trim().toUpperCase();
                    if (!/^BDEV-\d+$/.test(trimmed)) return;
                    const params = new URLSearchParams();
                    params.set("issue", trimmed);
                    if (accessParam) params.set("access", accessParam);
                    window.location.href = `/mvp-ticket-checklist?${params.toString()}`;
                  }}
                />

                <section
                  className={`rounded-3xl border p-5 sm:p-7 ${
                    allStepsComplete
                      ? "border-emerald-300/45 bg-emerald-300/10"
                      : !hasAgentProof || !hasBuild
                        ? "border-amber-300/40 bg-amber-300/5"
                        : "border-[var(--accent)]/45 bg-[var(--accent)]/10"
                  }`}
                  id={currentStepDomId}
                >
                  {celebration ? (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-300/45 bg-emerald-300/15 px-4 py-3 text-sm font-semibold text-emerald-100"
                      role="status"
                      aria-live="polite"
                    >
                      <Sparkles size={15} className="text-emerald-200" />
                      {celebration}
                    </motion.div>
                  ) : null}

                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl" style={textWrapStyle}>
                      {currentStep ? currentStep.title : "Write the result in Jira"}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2">
                      {buildChip ? (
                        <a
                          href={buildChip.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buildChipClassName(buildChip.kind)}
                          title={buildChipTooltip(buildChip)}
                        >
                          {buildChip.pulsing ? (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${buildChipDotClass(buildChip.kind)} opacity-75`} />
                              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${buildChipDotClass(buildChip.kind)}`} />
                            </span>
                          ) : (
                            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${buildChipDotClass(buildChip.kind)}`} />
                          )}
                          {buildChip.label}
                        </a>
                      ) : null}
                      {pollEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPollLastChecked(Date.now());
                            router.refresh();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent-light)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/15"
                          title="Buddy is checking Jira every 30 seconds. Click to refresh now."
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-light)] opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-light)]" />
                          </span>
                          Live · {pollAgeLabel}
                        </button>
                      ) : null}
                      <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white/90">
                        Step {Math.min(currentStepIndex + 1, studentSteps.length || 1)} / {studentSteps.length || 1}
                      </span>
                    </div>
                  </div>

                  <p className="text-lg leading-8 text-white">{currentStep?.body || "Add the final PASS or FAIL result to Jira."}</p>

                  {currentStep ? (
                    <div className="mt-5 grid gap-2 text-sm leading-6">
                      <p className="flex items-start gap-2.5 text-[var(--muted-strong)]">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-300/25 text-xs font-bold text-emerald-200">✓</span>
                        <span><span className="font-semibold text-emerald-100">You&apos;ll know it worked when:</span> {currentStep.pass}</span>
                      </p>
                      <p className="flex items-start gap-2.5 text-[var(--muted-strong)]">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-300/25 text-xs font-bold text-red-200">✗</span>
                        <span><span className="font-semibold text-red-100">Something&apos;s off if:</span> {currentStep.fail}</span>
                      </p>
                    </div>
                  ) : null}

                  {statusCard.localNote ? (
                    <p className="mt-3 flex items-center gap-2 rounded-md border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                      <RefreshCcw size={14} />
                      {statusCard.localNote}
                    </p>
                  ) : null}

                  {/* Primary actions */}
                  {!hasAgentProof ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await copyToClipboard("kickoff-codex", data.codingAgentPrompt);
                          openCodex();
                          if (studentSteps[0]) {
                            const stepOneKey = studentStepKey(0, studentSteps[0].title);
                            setChecks((current) => ({ ...current, [stepOneKey]: true }));
                          }
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-bold text-black transition-colors hover:bg-emerald-200"
                        title="Copies the full prompt + opens Codex (desktop app on Mac/PC, web on mobile). Paste into a new chat."
                      >
                        {copyResult?.id === "kickoff-codex" && copyResult.status === "copied" ? (
                          <>
                            <Check size={15} strokeWidth={3} />
                            <span className="truncate">Paste in Codex</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight size={15} />
                            Send to Codex
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyToClipboard("kickoff-claude", data.codingAgentPrompt);
                          openClaude();
                          if (studentSteps[0]) {
                            const stepOneKey = studentStepKey(0, studentSteps[0].title);
                            setChecks((current) => ({ ...current, [stepOneKey]: true }));
                          }
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-bold text-black transition-colors hover:bg-emerald-200"
                        title="Copies the full prompt + opens Claude (desktop app on Mac/PC, web on mobile). Paste into a new chat."
                      >
                        {copyResult?.id === "kickoff-claude" && copyResult.status === "copied" ? (
                          <>
                            <Check size={15} strokeWidth={3} />
                            <span className="truncate">Paste in Claude</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight size={15} />
                            Send to Claude
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}

                  {currentStep && hasAgentProof && hasBuild ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))}
                        className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-bold text-black transition-colors hover:bg-emerald-200 sm:w-auto"
                      >
                        <Check size={17} strokeWidth={3} />
                        Mark this step done
                      </button>
                    </div>
                  ) : null}

                  {/* Secondary actions */}
                  {(!hasAgentProof || statusCard.localNote) ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {statusCard.localNote ? (
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-300/45 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-300/20"
                        >
                          <RefreshCcw size={13} />
                          Refresh from Jira
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Tertiary utility row */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs">
                    <a
                      href={data.issueUrl}
                      className="inline-flex items-center gap-1 font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
                    >
                      <ExternalLink size={12} />
                      Open in Jira
                    </a>
                    <button
                      type="button"
                      onClick={() => setHelperHidden((value) => !value)}
                      className="inline-flex items-center gap-1 font-semibold text-sky-200 transition-colors hover:text-sky-100"
                      aria-expanded={!helperHidden}
                    >
                      <Sparkles size={12} />
                      {helperHidden ? "Ask Buddy" : "Hide Buddy"}
                    </button>
                    {currentStep && (!hasAgentProof || !hasBuild) ? (
                      <button
                        type="button"
                        onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))}
                        className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--muted)] transition-colors hover:text-white"
                        title="Tick this only if you've genuinely completed this step"
                      >
                        <Check size={12} />
                        Mark done anyway
                      </button>
                    ) : null}
                  </div>

                  {!helperHidden ? (
                    <div className="mt-4">
                      <BlipMascotGuide
                        compact
                        isLoading={coachState.status === "loading"}
                        sourceLabel={mascotSourceLabel}
                        speech={mascotSpeech}
                        stepTitle={buildMascotTitle(currentStep, currentStepIndex)}
                        onExplain={loadCoach}
                        onNextStep={scrollToCurrentStep}
                        onHide={() => setHelperHidden(true)}
                      />
                    </div>
                  ) : null}
                </section>

                <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-white">Progress</span>
                    <span className="text-sm font-bold text-[var(--accent-light)]">{progress}%</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {progressLabels.map((label, index) => {
                      const step = studentSteps[index];
                      const done = step ? Boolean(checks[studentStepKey(index, step.title)]) : false;
                      const active = index === currentStepIndex && !allStepsComplete;
                      return (
                        <div
                          key={label}
                          className={`rounded-xl border p-3.5 text-sm font-bold ${
                            done
                              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                              : active
                                ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-white"
                                : "border-[var(--border)] bg-black/20 text-[var(--muted-strong)]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                                done ? "bg-emerald-300 text-black" : active ? "bg-[var(--accent)] text-white" : "bg-white/10 text-[var(--muted)]"
                              }`}
                            >
                              {done ? <Check size={14} strokeWidth={3} /> : index + 1}
                            </span>
                            <span className="min-w-0">{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3">
                {studentSteps.map((step, index) => {
                  const key = studentStepKey(index, step.title);
                  const checked = Boolean(checks[key]);
                  const isCurrentStep = index === currentStepIndex;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChecks((current) => ({ ...current, [key]: !checked }))}
                      className={`grid scroll-mt-28 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border p-4 text-left transition-colors ${
                        checked
                          ? "border-emerald-300 bg-emerald-300/15"
                          : isCurrentStep
                            ? "border-[var(--accent)]/45 bg-[var(--accent)]/10"
                            : "border-[var(--border)] bg-black/20 hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${
                          checked ? "border-emerald-300 bg-emerald-300 text-black" : isCurrentStep ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white" : "border-[var(--border-strong)] bg-white/5 text-[var(--muted-strong)]"
                        }`}
                        aria-hidden="true"
                      >
                        {checked ? <Check size={20} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words font-bold leading-6 text-white" style={textWrapStyle}>
                          {step.title}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-[var(--muted-strong)]">
                          {checked
                            ? index === 0 && !hasAgentProof
                              ? "Sent. Waiting for the AI to post back."
                              : index === 1 && !hasBuild
                                ? "Confirmed. Refresh when Jira names the build."
                                : "Done. Tap to undo."
                            : isCurrentStep ? "Open above." : "Coming next."}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              </>
            ) : (
              <ErrorPanel state={state} accessParam={accessParam} />
            )}
          </div>
        </div>
      </section>

      {ready && data ? (
        <section className="px-4 pb-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full min-w-0 max-w-[calc(100vw-2rem)] gap-3 sm:max-w-7xl" style={viewportWidthStyle}>
            <DisclosurePanel title="What this fix is about" icon={<Sparkles size={18} />}>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4 lg:col-span-2">
                  <p className="text-lg font-bold text-white">{workRecipe.kind}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{workRecipe.risk}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                    <span className="font-semibold text-white">Testing:</span> {workRecipe.testingPosture}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                  <p className="text-sm font-bold text-white">Agent can call it done?</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{workRecipe.proofAuthority.summary}</p>
                </div>
              </div>
            </DisclosurePanel>

            <DisclosurePanel title="Where do I need to test this?" icon={<MonitorSmartphone size={18} />}>
              <p className="text-sm leading-6 text-[var(--muted-strong)]">{surfaceSummary}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {surfaceCards.map((note) => {
                  const Icon = note.needsHumanDevice ? Smartphone : note.label.toLowerCase().includes("simulator") ? MonitorSmartphone : ShieldCheck;
                  return (
                    <div
                      key={note.label}
                      className={`rounded-lg border p-4 ${
                        note.active ? "border-[var(--accent)]/40 bg-[var(--accent)]/10" : "border-[var(--border)] bg-black/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={note.active ? "text-[var(--accent-light)]" : "text-[var(--muted)]"} />
                        <span className="font-bold">{note.label}</span>
                        {note.active ? <Check size={16} className="ml-auto text-emerald-300" /> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{note.detail}</p>
                    </div>
                  );
                })}
              </div>
            </DisclosurePanel>

            <DisclosurePanel title="See the AI's instructions for this ticket" icon={<Bot size={18} />}>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="max-w-2xl text-sm leading-6 text-[var(--muted-strong)]">
                  This is what gets copied when you tap Send to Codex or Send to Claude — the full briefing the AI reads before it touches the code.
                </p>
                <CopyButton
                  status={copyResult?.id === "agent-prompt" ? copyResult.status : undefined}
                  onClick={() => copyToClipboard("agent-prompt", data.codingAgentPrompt)}
                />
              </div>
              <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-sm leading-6 text-[var(--muted-strong)] [overflow-wrap:anywhere]">
                {data.codingAgentPrompt}
              </pre>
            </DisclosurePanel>

            <DisclosurePanel title="Technical Jira fields" icon={<FileText size={18} />}>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.values(data.fields).map((field) => {
                  const help = fieldHelp[field.fieldId];
                  return (
                    <div key={field.fieldId} className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-white">{field.label}</p>
                        <span className="rounded-md border border-[var(--border)] bg-black/25 px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                          {field.fieldId}
                        </span>
                      </div>
                      <p className={`mt-2 text-sm font-bold leading-6 ${field.empty ? "text-amber-200" : "text-[var(--accent-light)]"}`}>
                        Current value: {field.value}
                      </p>
                      {help ? <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{help.plain}</p> : null}
                    </div>
                  );
                })}
              </div>
            </DisclosurePanel>

            <DisclosurePanel title="Debug details" icon={<ListChecks size={18} />}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(280px,0.25fr)]">
                <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                  <p className="text-sm font-bold text-white">Loop stage: {data.customFields.loopStage || "Not set in Jira"}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                    Proof recipe:{" "}
                    {proofRecipe.missingCount
                      ? `${proofRecipe.missingCount} missing detail${proofRecipe.missingCount === 1 ? "" : "s"}`
                      : "details present"}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {loopStages.map((stage, index) => (
                      <div
                        key={stage}
                        className={`rounded-lg border p-3 text-sm ${
                          index <= stageIndex ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-white" : "border-[var(--border)] bg-black/20 text-[var(--muted-strong)]"
                        }`}
                      >
                        {stage}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  {data.parent ? <IssueLinkRow issueUrl={data.issueUrl} link={data.parent} /> : null}
                  {data.links.map((link, index) => (
                    <IssueLinkRow issueUrl={data.issueUrl} key={`${link.key}-${link.relationship}-${index}`} link={link} />
                  ))}
                </div>
              </div>
            </DisclosurePanel>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ErrorPanel({ state, accessParam }: { state: TicketChecklistPageState; accessParam: string }) {
  const Icon = state.status === "access-required" || state.status === "access-misconfigured" ? LockKeyhole : AlertTriangle;
  const isAccessRequired = state.status === "access-required";
  const message = "message" in state ? state.message : "The ticket loaded, but the checklist view is not available.";
  const missingEnv = "missingEnv" in state ? state.missingEnv : [];
  const canUseLocalTokenSetup =
    state.status === "missing-config" &&
    missingEnv.includes("JIRA_API_TOKEN") &&
    !missingEnv.includes("JIRA_BASE_URL") &&
    !missingEnv.includes("JIRA_EMAIL");

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
          <Icon size={24} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-[var(--muted-strong)]">{state.issueKey || "Checklist"}</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight">{resultTitle(state)}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">{message}</p>
        </div>
      </div>

      {missingEnv.length ? (
        <div className="mt-5 grid gap-2">
          {missingEnv.map((envName) => (
            <code key={envName} className="rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm text-amber-100">
              {envName}
            </code>
          ))}
        </div>
      ) : null}

      {canUseLocalTokenSetup ? (
        <form
          action="/api/mvp-ticket-checklist/jira-token"
          method="post"
          className="mt-5 grid gap-3 rounded-lg border border-sky-300/25 bg-sky-300/10 p-4"
        >
          <input type="hidden" name="issue" value={state.issueKey} />
          <div>
            <p className="text-sm font-bold text-white">Paste your Jira API token once</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-strong)]">
              This stores it in a private localhost cookie for this browser session. It is not shown on the page or put in the URL.
            </p>
          </div>
          <label className="sr-only" htmlFor="jiraApiToken">
            Jira API token
          </label>
          <input
            id="jiraApiToken"
            name="jiraApiToken"
            className="min-h-12 w-full rounded-lg border border-[var(--border)] bg-black/35 px-3 text-base text-white outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            placeholder="Paste Jira API token"
            type="password"
            autoComplete="off"
          />
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] sm:w-fit"
          >
            Save token and load ticket
            <ArrowRight size={17} />
          </button>
        </form>
      ) : null}

      {isAccessRequired ? (
        <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="hidden" name="issue" value={state.issueKey} />
          <label className="sr-only" htmlFor="access">
            Private checklist access key
          </label>
          <div className="relative min-w-0">
            <KeyRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="access"
              name="access"
              defaultValue={accessParam}
              className="min-h-12 w-full rounded-lg border border-[var(--border)] bg-black/30 pl-10 pr-3 text-base text-white outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              placeholder="Access key"
              type="password"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)]"
          >
            Unlock
            <ArrowRight size={17} />
          </button>
        </form>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={state.dashboardUrl}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
        >
          Open Jira dashboard
          <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );
}

function CopyButton({
  status,
  onClick,
  label = "Copy",
}: {
  status?: "copied" | "failed";
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
    >
      {status === "copied" ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
      <span>{status === "copied" ? "Copied" : status === "failed" ? "Try again" : label}</span>
    </button>
  );
}

function DisclosurePanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-[var(--border-strong)] bg-[var(--card-bg)] p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent-light)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-lg font-bold text-white">{title}</span>
        <span className="rounded-full border border-[var(--border)] bg-black/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-strong)] group-open:hidden">
          Open
        </span>
        <span className="hidden rounded-full border border-[var(--border)] bg-black/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-strong)] group-open:inline-flex">
          Close
        </span>
      </summary>
      <div className="mt-4 border-t border-[var(--border)] pt-4">{children}</div>
    </details>
  );
}

function BlipMascotGuide({
  compact,
  isLoading,
  sourceLabel,
  speech,
  stepTitle,
  onExplain,
  onNextStep,
  onHide,
}: {
  compact: boolean;
  isLoading: boolean;
  sourceLabel: string;
  speech: string;
  stepTitle: string;
  onExplain: () => void;
  onNextStep: () => void;
  onHide: () => void;
}) {
  const stopClick = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  return (
    <motion.div
      key={stepTitle}
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className={`relative overflow-hidden rounded-lg border border-sky-300/30 bg-black/75 shadow-2xl backdrop-blur ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(124,251,232,0.2),transparent_42%),radial-gradient(circle_at_100%_20%,rgba(124,57,255,0.25),transparent_44%)]" />
      <div className={`relative flex ${compact ? "items-center gap-3" : "items-start gap-3"}`}>
        <motion.div
          animate={{ y: [0, -7, 0], rotate: [0, -2, 2, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          className="relative shrink-0"
        >
          <Image
            src="/mascot/blip-bot.png"
            alt="Blip bot helper"
            width={compact ? 72 : 96}
            height={compact ? 72 : 96}
            className={compact ? "h-[72px] w-[72px]" : "h-24 w-24"}
            priority={false}
            unoptimized
          />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-xs font-bold text-sky-100">
              {sourceLabel}
            </span>
            <span className="rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-xs font-bold text-emerald-100">
              Private ticket details hidden
            </span>
          </div>
          <h3 className="mt-2 break-words text-base font-bold leading-tight text-white" style={textWrapStyle}>
            {stepTitle}
          </h3>
          <p className="mt-2 break-words text-sm leading-6 text-[var(--muted-strong)]" style={textWrapStyle}>
            {speech}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => stopClick(event, onExplain)}
              disabled={isLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={15} />
              {isLoading ? "Thinking..." : "Ask Buddy"}
            </button>
            <button
              type="button"
              onClick={(event) => stopClick(event, onNextStep)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
            >
              Next step
            </button>
            <button
              type="button"
              onClick={(event) => stopClick(event, onHide)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-black/25 px-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-white"
            >
              Hide
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type QueueRow = {
  issueKey: string;
  summary: string;
  status: string;
  priority: string;
  mvpTrack: string;
  loopStage: string;
  verificationSurface: string;
  humanFinalReview: string;
  verifiedBuildOrCommit: string;
  updatedAt: string;
  statusChangedAt: string;
  blocksKeys: string[];
  blockedByKeys: string[];
  reasons: string[];
  ageInStatusHours: number;
  hasBuild: boolean;
  hasHumanReady: boolean;
  surfaceList: string[];
  presence: { sessionId: string; ageMinutes: number } | null;
};

type QueueState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rows: QueueRow[]; total: number; presenceEnabled: boolean }
  | { status: "error"; message: string };

const SESSION_ID_KEY = "buddy_session_id";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      window.localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function buildIssueHref(issueKey: string, accessParam: string): string {
  const params = new URLSearchParams();
  params.set("issue", issueKey);
  if (accessParam) params.set("access", accessParam);
  return `/mvp-ticket-checklist?${params.toString()}`;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function openCodex(): void {
  if (isMobileDevice()) {
    window.open("https://chatgpt.com/codex", "_blank", "noopener,noreferrer");
  } else {
    window.location.href = "codex://";
  }
}

function openClaude(): void {
  if (isMobileDevice()) {
    window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
  } else {
    window.location.href = "claude://";
  }
}

function TicketHeaderStrip({
  issueKey,
  status,
  summary,
  issueUrl,
  onClearTicks,
  onChangeTicket,
}: {
  issueKey: string;
  status: string;
  summary: string;
  issueUrl: string;
  onClearTicks: () => void;
  onChangeTicket: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: globalThis.MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-black/20 px-4 py-2.5">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)]/15 px-2 py-1 text-xs font-bold text-[var(--accent-light)]">
        <TicketCheck size={13} />
        {issueKey}
      </span>
      <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(status)}`}>
        {status || "—"}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-sm font-semibold text-white"
        title={summary || ""}
      >
        {summary || "(no summary)"}
      </span>
      <a
        href={issueUrl}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted-strong)] transition-colors hover:text-white"
        title="Open in Jira"
        aria-label="Open in Jira"
      >
        <ExternalLink size={14} />
      </a>
      <div className="relative shrink-0" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted-strong)] transition-colors hover:text-white"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More ticket actions"
        >
          <MoreHorizontal size={14} />
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-[var(--border-strong)] bg-black/95 p-1 shadow-2xl backdrop-blur"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChangeTicket();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-white hover:bg-white/5"
            >
              <Search size={14} />
              Change ticket…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClearTicks();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-white hover:bg-white/5"
            >
              <RefreshCcw size={14} />
              Clear ticks
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BuddySuggestionStrip({
  accessParam,
  currentIssueKey,
  ready,
}: {
  accessParam: string;
  currentIssueKey: string;
  ready: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<QueueState>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const [sessionId] = useState<string>(() =>
    typeof window === "undefined" ? "" : getOrCreateSessionId(),
  );
  const [isNavigating, startNavigation] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setState({ status: "loading" });
      try {
        const url = `/api/mvp-ticket-checklist/queue${accessParam ? `?access=${encodeURIComponent(accessParam)}` : ""}`;
        const response = await fetch(url, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (body.status !== "ready") {
          setState({ status: "error", message: body.message || "Queue could not load." });
          return;
        }
        setState({
          status: "ready",
          rows: Array.isArray(body.rows) ? body.rows : [],
          total: typeof body.total === "number" ? body.total : 0,
          presenceEnabled: Boolean(body.presenceEnabled),
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Queue request failed.",
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessParam, ready, currentIssueKey]);

  useEffect(() => {
    if (!ready || !currentIssueKey) return;
    const sid = sessionId || getOrCreateSessionId();
    if (!sid) return;
    fetch("/api/mvp-ticket-checklist/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue: currentIssueKey, sessionId: sid, access: accessParam || undefined }),
    }).catch(() => {});
  }, [accessParam, currentIssueKey, ready, sessionId]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: globalThis.MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function navigateTo(issueKey: string) {
    setOpen(false);
    startNavigation(() => {
      router.push(buildIssueHref(issueKey, accessParam));
    });
  }

  function pickForMe() {
    if (state.status !== "ready" || !state.rows.length) return;
    const topKey = state.rows[0].issueKey;
    if (topKey === currentIssueKey) {
      setOpen(true);
      return;
    }
    navigateTo(topKey);
  }

  const rows = state.status === "ready" ? state.rows : [];
  const total = state.status === "ready" ? state.total : 0;
  const top = rows[0];
  const topReasons = top ? top.reasons.slice(0, 2).join(" · ") : "";
  const onTop = top && top.issueKey === currentIssueKey;

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-4 py-3"
    >
      <Sparkles size={14} className="shrink-0 text-[var(--accent-light)]" />
      <span className="min-w-0 flex-1 truncate text-sm text-white">
        {state.status === "loading"
          ? "Buddy is checking your queue…"
          : state.status === "error"
            ? state.message
            : !top
              ? "Nothing is ready to verify right now."
              : onTop
                ? `You're on Buddy's #1 pick. ${rows.length - 1} more ready.`
                : (
                  <>
                    <span className="text-[var(--muted)]">Buddy suggests </span>
                    <span className="font-bold text-white">{top.issueKey}</span>
                    {top.mvpTrack ? <span className="text-[var(--muted)]"> · {top.mvpTrack}</span> : null}
                    {topReasons ? <span className="text-[var(--muted-strong)]"> — {topReasons}</span> : null}
                  </>
                )}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {top && !onTop ? (
          <button
            type="button"
            onClick={pickForMe}
            disabled={isNavigating}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isNavigating ? "Loading…" : "Open"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={state.status !== "ready" || rows.length === 0}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-sky-300/35 bg-sky-300/10 px-2.5 text-xs font-bold text-sky-100 transition-colors hover:bg-sky-300/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Queue
          {state.status === "ready" && total > 0 ? (
            <span className="rounded-sm bg-sky-300/20 px-1 text-[10px]">{total}</span>
          ) : null}
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && rows.length > 0 ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[480px] overflow-auto rounded-lg border border-sky-300/35 bg-black/95 p-2 shadow-2xl backdrop-blur"
        >
          {rows.map((row, index) => {
            const collision = row.presence && row.presence.sessionId !== sessionId ? row.presence : null;
            const isCurrent = row.issueKey === currentIssueKey;
            return (
              <button
                key={row.issueKey}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => navigateTo(row.issueKey)}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-lg p-3 text-left transition-colors ${
                  isCurrent ? "bg-sky-300/15" : "hover:bg-white/5"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent-light)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{row.issueKey}</span>
                    <span className="rounded-md border border-[var(--border)] bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted-strong)]">
                      {row.status}
                    </span>
                    {row.mvpTrack ? (
                      <span className="rounded-md border border-[var(--border)] bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--muted-strong)]">
                        {row.mvpTrack}
                      </span>
                    ) : null}
                    {collision ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/35 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                        <Users size={11} />
                        Loaded {collision.ageMinutes}m ago
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-white">{row.summary}</p>
                  {row.reasons.length ? (
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--muted-strong)]">
                      <Clock size={11} />
                      {row.reasons.join(" · ")}
                    </p>
                  ) : null}
                  {row.surfaceList.length ? (
                    <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      {row.surfaceList.join(" / ")}
                    </p>
                  ) : null}
                </div>
                <ArrowRight size={16} className="self-center text-[var(--muted-strong)]" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IssueLinkRow({
  issueUrl,
  link,
}: {
  issueUrl: string;
  link: { key: string; relationship: string; summary: string; status: string };
}) {
  const baseUrl = issueUrl.split("/browse/")[0] || "https://heyblip.atlassian.net";

  return (
    <a
      href={`${baseUrl}/browse/${encodeURIComponent(link.key)}`}
      className="grid gap-2 rounded-lg border border-[var(--border)] bg-black/20 p-4 transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch size={16} className="shrink-0 text-[var(--accent-light)]" />
        <span className="min-w-0 truncate text-sm font-bold">{link.key}</span>
        <span className="rounded-md border border-[var(--border)] bg-black/25 px-2 py-1 text-xs font-semibold text-[var(--muted-strong)]">
          {link.relationship}
        </span>
        <ExternalLink size={14} className="ml-auto shrink-0 text-[var(--muted)]" />
      </div>
      <p className="text-sm leading-6 text-[var(--muted-strong)]" style={textWrapStyle}>
        {link.summary || "No summary returned"}
      </p>
      {link.status ? (
        <span className={`w-fit rounded-md border px-2 py-1 text-xs font-bold ${statusTone(link.status)}`}>
          {link.status}
        </span>
      ) : null}
    </a>
  );
}
