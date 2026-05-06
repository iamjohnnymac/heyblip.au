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
  Clipboard,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  KeyRound,
  ListChecks,
  LockKeyhole,
  MonitorSmartphone,
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

const COACH_REQUEST_TIMEOUT_MS = 100000;

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

const cardTextWidthStyle: CSSProperties = {
  ...textWrapStyle,
  maxWidth: "calc(100vw - 5.5rem)",
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

function formatDate(value?: string): string {
  if (!value) return "Not returned";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compactMobileText(value: string, maxLength = 58): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
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
      title: plan.agentUpdate.found ? "Read the agent result" : "Stop: wait for the agent",
      body: plan.agentUpdate.found
        ? "Check the agent says what it tested before you pick up a phone."
        : "Do not test yet. Ask the agent to post the Agent Test Update first.",
      pass: plan.agentUpdate.found
        ? "Update has real commands or screenshots and the build is named — no [Passed / Failed] placeholders."
        : "An Agent Test Update appears in Jira with real values, not template placeholders.",
      fail: plan.agentUpdate.found
        ? "Update is vague, has [Passed / Failed] placeholders, or doesn't name the build."
        : "No Agent Test Update yet, or it still has [Passed / Failed] template placeholders.",
    },
    {
      title: buildOrCommit ? "Use the right build" : "Stop: get the build",
      body: buildOrCommit ? `Only test ${buildOrCommit}.` : "Do not test until Jira says the exact build or commit.",
      pass: "Your phone has the same build written on Jira.",
      fail: "You are testing the wrong build, or the build is unknown.",
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
    return "Stop here first. Ask the agent to post what it tested before you touch the phones.";
  }

  if (title.includes("build") || title.includes("commit")) {
    return "Stop here first. Get the exact build or commit so you test the right version.";
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
  const [helperHidden, setHelperHidden] = useState(false);
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
        label: "DONE: write result in Jira",
        body: "All local steps are ticked. Put the final PASS or FAIL evidence back into Jira before closing.",
        className: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
      }
    : !hasAgentProof
      ? {
          label: "STOP: waiting for agent",
          body: "Do not test yet. First, get the agent to post exactly what it tested.",
          localNote: step1LocallyTicked
            ? "You ticked step 1 locally, but Jira still has no Agent Test Update. Refresh to recheck."
            : undefined,
          className: "border-amber-300/35 bg-amber-300/10 text-amber-100",
        }
      : !hasBuild
        ? {
            label: "STOP: missing build",
            body: "Do not test yet. Jira needs the exact build number or commit first.",
            localNote: step2LocallyTicked
              ? "You ticked step 2 locally, but Jira still has no build/commit named. Refresh to recheck."
              : undefined,
            className: "border-amber-300/35 bg-amber-300/10 text-amber-100",
          }
        : {
            label: "READY: test this build",
            body: `Use ${buildOrCommit} and follow the active step below.`,
            className: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
          };
  const progressLabels = ["Agent proof", "Build", "Test", "Jira result"].slice(0, Math.max(studentSteps.length, 1));
  const surfaceSummary = realPhoneRequired
    ? "Final pass needs the named phone/TestFlight evidence. Use simulator only for the parts that do not depend on APNs, BLE, background wake, or two-account behavior."
    : "This looks simulator-first from Jira. Use phones only if the acceptance criteria add APNs, BLE, background, or two-account delivery.";
  const agentUpdateTemplate = data?.commentTemplates.find((template) => /agent/i.test(`${template.id} ${template.title}`));

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
          className="mx-auto w-full min-w-0 max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] p-4 sm:max-w-7xl sm:p-6"
          style={viewportWidthStyle}
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--muted-strong)]">
                  <Sparkles size={16} className="shrink-0 text-[var(--accent-light)]" />
                  <span className="min-w-0 leading-5">Blip Test Buddy</span>
                </div>
                <h1 className="break-words text-3xl font-bold leading-tight sm:text-5xl" style={textWrapStyle}>
                  Do one safe thing next.
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-strong)]">
                  Pick a BDEV ticket. Buddy turns it into plain-English steps and keeps the scary Jira detail tucked away.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:max-w-[520px]">
              <TicketQueuePicker
                accessParam={accessParam}
                currentIssueKey={data?.issueKey ?? issueKey}
                ready={ready}
              />
              <form className="grid w-full min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-black/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor="issue">
                BDEV issue key
              </label>
              <div className="relative min-w-0">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  id="issue"
                  name="issue"
                  defaultValue={issueKey}
                  className="min-h-12 w-full rounded-lg border border-[var(--border)] bg-black/30 pl-10 pr-3 text-base font-bold uppercase text-white outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  placeholder="BDEV-493"
                  autoCapitalize="characters"
                />
              </div>
              {accessParam ? <input type="hidden" name="access" value={accessParam} /> : null}
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] sm:w-auto"
              >
                Load
                <ArrowRight size={17} />
              </button>
            </form>
              </div>
            </div>

            {ready && data ? (
              <>
                <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-black/20 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)]/15 px-3 py-2 text-sm font-bold text-[var(--accent-light)]">
                        <TicketCheck size={16} />
                        {data.issueKey}
                      </span>
                      <span className={`inline-flex rounded-lg border px-3 py-2 text-xs font-bold ${statusTone(data.status)}`}>
                        {data.status || "No status"}
                      </span>
                    </div>
                    <h2 className="mt-3 break-words text-xl font-bold leading-tight sm:text-2xl" style={cardTextWidthStyle} title={data.summary || "No summary returned"}>
                      <span className="sm:hidden">{compactMobileText(data.summary || "No summary returned")}</span>
                      <span className="hidden sm:inline">{data.summary || "No summary returned"}</span>
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                      Updated {formatDate(data.updated)} · Assignee {data.assignee || "Unassigned"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 lg:justify-end">
                    <a
                      href={data.issueUrl}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
                    >
                      Jira
                      <ExternalLink size={15} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setChecks(buildEmptyChecks(data))}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
                    >
                      <RefreshCcw size={16} />
                      Clear ticks
                    </button>
                  </div>
                </div>

                <div className={`grid gap-4 rounded-lg border p-4 md:grid-cols-[auto_minmax(0,1fr)] ${statusCard.className}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setHelperHidden(false);
                      scrollToCurrentStep();
                    }}
                    className="group flex min-h-20 items-center justify-center rounded-lg border border-white/10 bg-black/25 px-4 transition-colors hover:border-sky-300/45"
                    aria-label="Show Blip Test Buddy"
                  >
                    <Image
                      src="/mascot/blip-bot.png"
                      alt="Blip Test Buddy"
                      width={72}
                      height={72}
                      className="h-[72px] w-[72px] transition-transform group-hover:scale-105"
                    />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase tracking-normal">{statusCard.label}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{statusCard.body}</p>
                    {statusCard.localNote ? (
                      <p className="mt-2 text-sm font-semibold leading-6 text-amber-200">
                        {statusCard.localNote}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm font-semibold text-sky-100">
                      Buddy is here. Tap him anytime to jump to the helper.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {!hasAgentProof && agentUpdateTemplate ? (
                        <CopyButton
                          status={copyResult?.id === agentUpdateTemplate.id ? copyResult.status : undefined}
                          onClick={() => copyToClipboard(agentUpdateTemplate.id, agentUpdateTemplate.body)}
                          label="Copy Agent Test Update"
                        />
                      ) : null}
                      {!hasAgentProof ? (
                        <CopyButton
                          status={copyResult?.id === "agent-prompt-banner" ? copyResult.status : undefined}
                          onClick={() => copyToClipboard("agent-prompt-banner", data.codingAgentPrompt)}
                          label="Copy coding-agent prompt"
                        />
                      ) : null}
                      {statusCard.localNote ? (
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300/45 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/20"
                        >
                          <RefreshCcw size={15} />
                          Refresh from Jira
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setHelperHidden(false);
                          scrollToCurrentStep();
                        }}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-300/35 bg-sky-300/10 px-3 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-300/15"
                      >
                        Show Buddy
                      </button>
                      <a
                        href={data.issueUrl}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
                      >
                        Open Jira to paste it
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                </div>

                <section className="rounded-lg border border-sky-300/45 bg-sky-300/10 p-4 sm:p-5" id={currentStepDomId}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold uppercase text-[var(--muted-strong)]">Do this now</p>
                      <h2 className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl" style={textWrapStyle}>
                        {currentStep ? currentStep.title : "Write the result in Jira"}
                      </h2>
                    </div>
                    <span className="rounded-lg border border-sky-300/30 bg-black/20 px-3 py-2 text-sm font-bold text-sky-100">
                      Step {Math.min(currentStepIndex + 1, studentSteps.length || 1)} of {studentSteps.length || 1}
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
                    <div className="grid gap-4">
                      <p className="text-lg leading-8 text-white">{currentStep?.body || "Add the final PASS or FAIL evidence to Jira."}</p>
                      {currentStep ? (
                        <div className="grid gap-3 text-sm leading-6 sm:grid-cols-2">
                          <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
                            <p className="font-bold text-emerald-100">Pass looks like</p>
                            <p className="mt-1 text-[var(--muted-strong)]">{currentStep.pass}</p>
                          </div>
                          <div className="rounded-lg border border-red-300/25 bg-red-300/10 p-3">
                            <p className="font-bold text-red-100">Fail looks like</p>
                            <p className="mt-1 text-[var(--muted-strong)]">{currentStep.fail}</p>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        {currentStep ? (
                          <button
                            type="button"
                            onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-bold text-black transition-colors hover:bg-emerald-200"
                          >
                            <Check size={17} strokeWidth={3} />
                            Mark this step done
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {!helperHidden ? (
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
                    ) : (
                      <button
                        type="button"
                        className="flex min-h-20 items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-black/20 px-4 text-sm font-bold text-[var(--muted-strong)] transition-colors hover:text-white"
                        onClick={() => setHelperHidden(false)}
                      >
                        <Image src="/mascot/blip-bot.png" alt="" width={44} height={44} className="h-11 w-11" />
                        Show Buddy
                      </button>
                    )}
                  </div>
                </section>

                <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
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
                          className={`rounded-lg border p-3 text-sm font-bold ${
                            done
                              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                              : active
                                ? "border-sky-300/50 bg-sky-300/10 text-white"
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
                      className={`grid scroll-mt-28 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-3 text-left transition-colors ${
                        checked
                          ? "border-emerald-300 bg-emerald-300/15"
                          : isCurrentStep
                            ? "border-sky-300/45 bg-sky-300/10"
                            : "border-[var(--border)] bg-black/20 hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
                          checked ? "border-emerald-300 bg-emerald-300 text-black" : isCurrentStep ? "border-sky-300 bg-sky-300/10 text-white" : "border-[var(--border-strong)] bg-white/5 text-[var(--muted-strong)]"
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
                          {checked ? "Done. Tap to undo." : isCurrentStep ? "Open above." : "Coming next."}
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
            <DisclosurePanel title="What this ticket needs" icon={<Sparkles size={18} />}>
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

            <DisclosurePanel title="Can this be done in simulator?" icon={<MonitorSmartphone size={18} />}>
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

            <DisclosurePanel title="Prompt for coding agent" icon={<Bot size={18} />}>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl text-sm leading-6 text-[var(--muted-strong)]">
                  Copy this into a fresh coding agent. It is rebuilt from the live Jira ticket, verification surfaces, proof recipe,
                  linked issues, and the current human test plan.
                </div>
                <CopyButton
                  status={copyResult?.id === "agent-prompt" ? copyResult.status : undefined}
                  onClick={() => copyToClipboard("agent-prompt", data.codingAgentPrompt)}
                />
              </div>
              <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-black/40 p-4 text-sm leading-6 text-[var(--muted-strong)] [overflow-wrap:anywhere]">
                {data.codingAgentPrompt}
              </pre>
            </DisclosurePanel>

            <DisclosurePanel title="Templates for testers (John/Tay)" icon={<Clipboard size={18} />}>
              <p className="mb-3 text-sm leading-6 text-[var(--muted-strong)]">
                What you paste into Jira after testing on a real device.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.commentTemplates
                  .filter((template) => template.audience === "human")
                  .map((template) => (
                    <div key={template.id} className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="min-w-0 font-bold">{template.title}</h3>
                        <CopyButton
                          status={copyResult?.id === template.id ? copyResult.status : undefined}
                          onClick={() => copyToClipboard(template.id, template.body)}
                        />
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-3 text-xs leading-5 text-[var(--muted-strong)] [overflow-wrap:anywhere]">
                        {template.body}
                      </pre>
                    </div>
                  ))}
              </div>
            </DisclosurePanel>

            <DisclosurePanel title="Templates for the coding agent" icon={<Bot size={18} />}>
              <p className="mb-3 text-sm leading-6 text-[var(--muted-strong)]">
                Send these to the agent, or paste them into Jira on the agent&apos;s behalf. You usually do not need to read them yourself.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.commentTemplates
                  .filter((template) => template.audience === "agent")
                  .map((template) => (
                    <div key={template.id} className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="min-w-0 font-bold">{template.title}</h3>
                        <CopyButton
                          status={copyResult?.id === template.id ? copyResult.status : undefined}
                          onClick={() => copyToClipboard(template.id, template.body)}
                        />
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-3 text-xs leading-5 text-[var(--muted-strong)] [overflow-wrap:anywhere]">
                        {template.body}
                      </pre>
                    </div>
                  ))}
              </div>
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
    <details className="group rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] p-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent-light)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-lg font-bold text-white">{title}</span>
        <span className="rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-sm font-semibold text-[var(--muted-strong)] group-open:hidden">
          Open
        </span>
        <span className="hidden rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-sm font-semibold text-[var(--muted-strong)] group-open:inline-flex">
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

function TicketQueuePicker({
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

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-3 rounded-lg border border-sky-300/30 bg-sky-300/5 p-3 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <Sparkles size={15} className="text-[var(--accent-light)]" />
          What should I test next?
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">
          {state.status === "loading"
            ? "Reading Jira queue…"
            : state.status === "error"
              ? state.message
              : state.status === "ready"
                ? rows.length
                  ? `${rows.length} ready (${total} candidate${total === 1 ? "" : "s"} in flight)`
                  : "No tickets are ready to verify right now."
                : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pickForMe}
          disabled={state.status !== "ready" || rows.length === 0 || isNavigating}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={15} />
          {isNavigating ? "Loading…" : "Pick for me"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={state.status !== "ready" || rows.length === 0}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-300/35 bg-sky-300/10 px-3 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-300/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pick from queue
          <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
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
