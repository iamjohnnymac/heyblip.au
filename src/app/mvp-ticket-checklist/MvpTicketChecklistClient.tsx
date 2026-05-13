"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  ListChecks,
  MessageSquareText,
  MonitorSmartphone,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { ChecklistViewModel, HumanTestResultViewModel, JiraChecklistResult } from "@/lib/mvp-ticket-checklist";
import { capitalizeFirst, descriptionExcerpt, findManualBugStep, shortTestInstruction } from "@/lib/checklist-helpers";

import { QueueBreadcrumb } from "./_components/QueueBreadcrumb";
import { StepTabs, type StepTab } from "./_components/StepTabs";
import { FocusCard } from "./_components/FocusCard";
import { AgentTestSummaryPanel, AgentTestSummaryChip } from "./_components/AgentTestSummary";
import { GenerateSummaryButton } from "./_components/GenerateSummaryButton";
import type { PendingAttachment } from "./_components/FindingsPanel";
import {
  FindingsPanel,
  VerdictActionButtons,
  type FindingsBody,
  type FindingsState,
  type TransitionState,
} from "./_components/FindingsPanel";
import { PastHumanTestResultsPanel } from "./_components/PastHumanTestResults";
import { AskBuddyInline } from "./_components/AskBuddyInline";
import { ErrorPanel } from "./_components/ErrorPanel";
import { CopyButton, DisclosurePanel, InlineMarkdown, IssueLinkRow } from "./_components/SmallComponents";
import {
  buildInstallLabel,
  buildProofSha,
  decodeHtmlEntities,
  humaniseTimestamps,
  openClaude,
  openCodex,
  statusTone,
  textWrapStyle,
  writeClipboardText,
} from "./_components/shared";

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
  | { status: "ready"; source: "haiku" | "fallback"; message?: string; coach: CoachPayload; stepIndex: number }
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
// Bumped from 30s to 60s so a verdict request that's pulling vision can
// land — image upload + Sonnet vision call + Jira comment post easily
// goes over 30s when 1-4 screenshots are attached.
const FINDINGS_REQUEST_TIMEOUT_MS = 60_000;
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

const surfaceNotes = [
  {
    label: "Automated",
    icon: ShieldCheck,
    detail: "Good for model logic, routing state, payload parsing, and regression locks.",
  },
  {
    label: "Simulator",
    icon: MonitorSmartphone,
    detail: "Good for UI state, deeplinks, local notifications, badge clearing, and cold launch.",
  },
  {
    label: "Real phones",
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
    humanTestRequestedItems: [],
    humanTestRequestedPreamble: "",
    sentryWatchIds: [],
    evidence: [],
    surfaceResults: {
      automated: "Not reported",
      simulator: "Not reported",
      workerSmoke: "Not reported",
    },
    passIf: "",
    failIf: "",
  },
  steps: [],
};

const fieldHelp: Record<string, { plain: string; action: string }> = {
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

// Should the "Generate AI Summary" button render on this ticket?
// Yes for tickets the AI has touched or is mid-touching — Verifying,
// In Review, Ready for Review, In Progress. No for To Do / Selected /
// Backlog tickets, where the existing Send to Codex/Claude flow is the
// right starting point.
function shouldShowGenerateButton(status: string): boolean {
  const s = (status || "").toLowerCase().trim();
  if (!s) return false;
  return /^(verifying|in review|ready for review|in progress|in-progress)$/.test(s);
}

function currentStageIndex(stage: string): number {
  const normalized = stage.toLowerCase();
  const index = loopStages.findIndex((item) => normalized.includes(item.toLowerCase()));
  return index === -1 ? 0 : index;
}

function isReadyState(state: TicketChecklistPageState): state is Extract<JiraChecklistResult, { status: "ready" }> {
  return state.status === "ready";
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
  // "AI done, no formal plan" = ticket already merged (Verifying/Done) but
  // the agent never posted a structured "Agent Test Update" comment, so we
  // can't show the AI's plan — but the ticket description is still the best
  // test guide we have.
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
  const aiDoneNoFormalPlan = !plan.agentUpdate.found && (
    statusLower === "verifying" ||
    statusLower === "done" ||
    statusLower === "in review" ||
    statusLower === "ready for review"
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

  // The AI's plain-English plan for John/Tay. Comes from the parsed
  // ordered list under "Human test requested" — when present, we use it
  // directly in step 3 so the user sees the real test (not a generic
  // template fallback). Falls back to the legacy track-recipe text when
  // the AI didn't write one.
  const aiPhonePlan = plan.agentUpdate.humanTestRequestedItems;
  const aiFirstItem = aiPhonePlan[0];
  const aiPhoneInstruction = aiFirstItem
    ? aiFirstItem.title && aiFirstItem.body
      ? `${aiFirstItem.title} — ${aiFirstItem.body}`
      : aiFirstItem.body || aiFirstItem.title
    : "";
  const aiPhonePassHint = aiFirstItem && /no infinite loop|no banner|no spinner|signs you in|no error/i.test(
    aiFirstItem.body,
  )
    ? "The phone behaves as the AI's plan describes — no stuck spinner, no error, no loop."
    : "";

  return [
    {
      title: plan.agentUpdate.found
        ? "Here's what to test"
        : aiDoneNoFormalPlan
          ? "AI's done — no formal test plan was posted"
          : notStarted
            ? "Send this to an AI to start"
            : "AI is still coding this",
      body: plan.agentUpdate.found
        ? "Here's what changed, the build to install, and what to look for on your phone."
        : aiDoneNoFormalPlan
          ? "The fix is merged but nobody posted a structured 'Agent Test Update' comment. Use the ticket description (and your judgment) as the test guide. Step 3 below pulls it through."
          : notStarted
            ? "No AI has picked this up yet. Tap a green button below to send the prompt to Codex or Claude — the AI will do the coding and post a summary back to Jira."
            : "An AI is writing the fix. When it posts a summary in Jira (a comment titled 'Agent Test Update'), this card turns green and it's your turn.",
      pass: plan.agentUpdate.found
        ? plan.agentUpdate.passIf || "The summary below has real commands or a build number — not [Passed / Failed] placeholders."
        : aiDoneNoFormalPlan
          ? "You've read the ticket description and you understand what changed."
          : notStarted
            ? "After you send it: an AI takes the prompt, does the work, and posts a summary in Jira."
            : "The AI's summary appears in Jira with real values, not template placeholders.",
      fail: plan.agentUpdate.found
        ? plan.agentUpdate.failIf || "The summary is vague, missing the build, or still has [Passed / Failed] placeholders."
        : aiDoneNoFormalPlan
          ? "The ticket description doesn't have enough info to test it. Reopen with what's missing."
          : notStarted
            ? "Nobody picked it up, or they posted without filling the template properly."
            : "No summary yet, or it still has unfilled [Passed / Failed] placeholders.",
    },
    {
      title: buildOrCommit ? "Install the right build" : "Wait for the new TestFlight build",
      body: buildOrCommit
        ? (() => {
            const installLabel = buildInstallLabel(buildOrCommit);
            const proof = buildProofSha(buildOrCommit);
            const proofTail = proof ? ` (merge proof: \`${proof}\`)` : "";
            return `Open TestFlight on your phone, find HeyBlip Beta, and install ${installLabel}${proofTail}. If TestFlight shows a higher build number, install that instead — older builds don't have the fix.`;
          })()
        : "The fix needs a TestFlight build before you can test it. Either: (1) wait for the PR to merge — CI cuts a new TestFlight build automatically (5-15 mins), or (2) ask the AI to trigger a build for the PR branch directly. Once a build is named in Jira, this card turns green.",
      pass: "TestFlight has a new HeyBlip Beta build and you've installed it.",
      fail: "No new build in TestFlight yet, or you're still on an older one.",
    },
    {
      title: "Try the bug once",
      body: aiFirstItem
        ? "Walk through the steps below on your phone, in order. The pass/fail criteria above are what to watch for as you go."
        : shortTestInstruction(
            phoneStep?.doThis ||
              data.recommendedAction.steps[0] ||
              (aiDoneNoFormalPlan ? descriptionExcerpt(data.descriptionText) : "") ||
              "Run the test written on Jira.",
            workKind,
          ),
      pass: capitalizeFirst(
        plan.agentUpdate.passIf || aiPhonePassHint || phoneStep?.passMeans || "The bug no longer happens.",
      ),
      fail: capitalizeFirst(
        plan.agentUpdate.failIf || phoneStep?.failMeans || "The bug still happens, or the result is confusing.",
      ),
    },
    {
      title: "Write pass or fail",
      body: shortTestInstruction(finalStep?.doThis || "Write one Jira comment saying PASS or FAIL and what you saw.", workKind, false),
      pass: capitalizeFirst(finalStep?.passMeans || "Jira says what passed and on which build."),
      fail: capitalizeFirst(finalStep?.failMeans || "Jira says exactly what failed."),
    },
  ];
}

// Short step labels for the StepTabs strip — match the mockup's compact
// labels (not the full sentences inside the focus card body).
function shortStepLabel(step: StudentTestStep | undefined, index: number): string {
  const fallback = ["Read the plan", "Install the build", "Try the bug", "Write pass or fail"][index];
  if (!step) return fallback || `Step ${index + 1}`;
  const title = step.title.toLowerCase();
  if (title.includes("here's what to test") || title.includes("read what the ai")) return "Read the plan";
  if (title.includes("send this to an ai")) return "Send to an AI";
  if (title.includes("ai is still coding")) return "AI is coding";
  if (title.includes("no formal test plan")) return "Read the ticket";
  if (title.includes("install")) return "Install the build";
  if (title.includes("wait for the new")) return "Wait for the build";
  if (title.includes("try the bug")) return "Try the bug";
  if (title.includes("write pass")) return "Write pass or fail";
  if (title.includes("agent proof")) return "Check the AI proof";
  if (title.includes("check the build")) return "Check the build";
  if (title.includes("mark it in jira")) return "Mark it in Jira";
  return fallback || step.title;
}

// One-liner under the StepTabs row that says where the user is in plain
// English — replaces the per-row sub-status text from the old step list.
function stepCaption({
  step,
  index,
  checked,
  hasAgentProof,
  hasBuild,
}: {
  step: StudentTestStep | undefined;
  index: number;
  checked: boolean;
  hasAgentProof: boolean;
  hasBuild: boolean;
}): string {
  if (!step) return "";
  if (checked) {
    if (index === 0 && !hasAgentProof) return "Sent. Waiting for the AI to post back.";
    if (index === 1 && !hasBuild) return "Confirmed. Refresh when Jira names the build.";
    return "Done. Tap the tab again to undo.";
  }
  return step.body;
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

export default function MvpTicketChecklistClient({ state, accessParam }: Props) {
  const data = isReadyState(state) ? state.data : null;
  const ready = Boolean(data);
  const issueKey = data?.issueKey ?? state.issueKey;
  const workRecipe = data?.workRecipe ?? emptyWorkRecipe;
  const proofRecipe = data?.proofRecipe ?? emptyProofRecipe;
  const humanTestPlan = data?.humanTestPlan ?? emptyHumanTestPlan;
  const humanTestResults: HumanTestResultViewModel[] = data?.humanTestResults ?? [];
  const [askExpanded, setAskExpanded] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [pollLastChecked, setPollLastChecked] = useState<number>(() => Date.now());
  const prevHasAgentProofRef = useRef(false);
  const prevHasBuildRef = useRef(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatusState>({ kind: "idle" });
  const prevBuildSuccessRef = useRef(false);
  const [coachState, setCoachState] = useState<CoachState>({ status: "idle" });
  const [copyResult, setCopyResult] = useState<{ id: string; status: "copied" | "failed" } | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => (data ? buildEmptyChecks(data) : {}));
  const [findingsText, setFindingsText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [findingsState, setFindingsState] = useState<FindingsState>({ kind: "idle" });
  const [transitionState, setTransitionState] = useState<TransitionState>({ kind: "idle" });
  const studentSteps = useMemo(() => (data ? buildStudentTestSteps(data) : []), [data]);
  const activeStepIndex = studentSteps.findIndex((step, index) => !checks[studentStepKey(index, step.title)]);
  // When everything is ticked we still want to render Step 4 (so the user
  // sees the verdict card / past results) — pin currentStepIndex to the
  // last step. Otherwise it's the first un-ticked step.
  const currentStepIndex = activeStepIndex === -1 ? Math.max(studentSteps.length - 1, 0) : activeStepIndex;
  const currentStep = studentSteps[currentStepIndex];
  const buildOrCommit = humanTestPlan.agentUpdate.buildOrCommit || data?.customFields.verifiedBuildOrCommit || "";
  const coachMatchesCurrentStep = coachState.status === "ready" && coachState.stepIndex === currentStepIndex;
  const mascotSpeech =
    coachState.status === "error"
      ? `${buildMascotFallbackSpeech(currentStep, humanTestPlan, buildOrCommit)} Buddy used the local guide because AI was slow.`
      : coachMatchesCurrentStep
        ? coachState.coach.nextMove
        : buildMascotFallbackSpeech(currentStep, humanTestPlan, buildOrCommit);
  const mascotSourceLabel =
    coachMatchesCurrentStep && coachState.source === "haiku"
      ? "Haiku"
      : coachState.status === "loading" && coachState.stepIndex === currentStepIndex
        ? "Thinking"
        : "Local guide";
  // Surface a one-line hint when the route returned a fallback with
  // an explanation (Haiku failed mid-call, or no key configured) so
  // the "Local guide" badge isn't ambiguous.
  const mascotSourceHint =
    coachMatchesCurrentStep && coachState.source === "fallback" && coachState.message
      ? coachState.message
      : undefined;
  const router = useRouter();

  async function copyToClipboard(id: string, text: string) {
    const copied = await writeClipboardText(text);
    setCopyResult({ id, status: copied ? "copied" : "failed" });
    window.setTimeout(() => setCopyResult(null), 1800);
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
        | { status: "ready"; source: "haiku" | "fallback"; message?: string; coach: CoachPayload }
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

  async function submitFindings() {
    const trimmed = findingsText.trim();
    if (!trimmed) return;
    setTransitionState({ kind: "idle" });
    setFindingsState({ kind: "submitting" });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FINDINGS_REQUEST_TIMEOUT_MS);

    try {
      // Upload pending attachments to Jira first so the verdict request
      // can include their links in the evidence the AI sees. Skip when
      // nothing is attached so the path stays a single network call.
      let evidenceWithAttachments = evidenceText.trim();
      let uploadedAttachments: Array<{ filename: string; content: string; mimeType: string; size: number }> = [];
      if (pendingAttachments.length > 0) {
        const uploadForm = new FormData();
        uploadForm.append("issue", issueKey);
        if (accessParam) uploadForm.append("access", accessParam);
        for (const entry of pendingAttachments) {
          uploadForm.append("file", entry.file, entry.file.name);
        }
        const uploadResponse = await fetch("/api/mvp-ticket-checklist/findings-attachments", {
          method: "POST",
          signal: controller.signal,
          body: uploadForm,
        });
        const uploadBody = (await uploadResponse.json()) as
          | { status: "ready"; attachments: Array<{ filename: string; content: string; mimeType: string; size: number }> }
          | { status: "error"; message: string };
        if (!uploadResponse.ok || uploadBody.status !== "ready") {
          const message = uploadBody.status === "error" && uploadBody.message
            ? uploadBody.message
            : "Buddy couldn't upload the attachments. Try again or remove them.";
          setFindingsState({ kind: "error", message });
          return;
        }
        uploadedAttachments = uploadBody.attachments;
        const lines = uploadedAttachments.map((entry) => {
          const tag = entry.mimeType.startsWith("image/") ? "screenshot" : "log";
          return `Attached ${tag}: ${entry.filename} — ${entry.content}`;
        });
        // Free the client-side blob URLs now that the files live in Jira.
        for (const entry of pendingAttachments) {
          if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        }
        setPendingAttachments([]);
        evidenceWithAttachments = [evidenceWithAttachments, lines.join("\n")]
          .filter(Boolean)
          .join("\n\n");
      }

      const response = await fetch("/api/mvp-ticket-checklist/findings", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: issueKey,
          access: accessParam,
          findings: trimmed,
          evidence: evidenceWithAttachments,
          attachments: uploadedAttachments,
        }),
      });

      const body = (await response.json()) as FindingsBody;

      if (!response.ok || body.status !== "ready") {
        const message = body.status === "error" && body.message
          ? body.message
          : "Buddy couldn't send your findings. Try again.";
        setFindingsState({ kind: "error", message });
        return;
      }

      setFindingsState({ kind: "ready", body });

      // Auto-tick step 4 when the verdict comes back — the user has
      // genuinely written the result.
      const step4Index = studentSteps.length - 1;
      const step4 = studentSteps[step4Index];
      if (step4) {
        const key = studentStepKey(step4Index, step4.title);
        setChecks((current) => ({ ...current, [key]: true }));
      }

      // Pull fresh ticket state so the new Human Test Result comment
      // shows up inline immediately. router.refresh runs a server fetch.
      router.refresh();
    } catch {
      setFindingsState({
        kind: "error",
        message: "Buddy couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function runTransition(action: "mark-done" | "reopen") {
    if (findingsState.kind !== "ready") return;
    const body = findingsState.body;
    setTransitionState({ kind: "submitting", action });
    try {
      const response = await fetch("/api/mvp-ticket-checklist/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: issueKey,
          access: accessParam,
          action,
          findingsCommentId: body.postedCommentId,
          aiReasoning: body.verdict.reasoning,
          buildOrCommit: body.buildOrCommit,
        }),
      });
      const result = (await response.json()) as
        | { status: "ready"; action: string; partialFailures?: string[] }
        | { status: "error"; message: string };

      if (!response.ok || result.status !== "ready") {
        const message = "message" in result && result.message
          ? result.message
          : "The Jira transition didn't go through. Try again.";
        setTransitionState({ kind: "error", message });
        return;
      }

      setTransitionState({
        kind: "done",
        action,
        // Pass partial-failure messages through so the UI can surface
        // "transition went through but field reset failed" — the user
        // needs to know if the queue may not have updated.
        partialFailures: result.partialFailures,
      });
      router.refresh();
    } catch {
      setTransitionState({
        kind: "error",
        message: "Buddy couldn't reach Jira. Try again.",
      });
    }
  }

  function dismissFindings() {
    setFindingsState({ kind: "idle" });
    setTransitionState({ kind: "idle" });
  }

  const stageIndex = data ? currentStageIndex(data.customFields.loopStage) : 0;
  const surfaces = data ? splitValues(data.customFields.verificationSurface) : [];
  const realPhoneRequired = surfaces.some((surface) =>
    /one phone|two phones|testflight|apns|ble|background|relay/i.test(surface),
  );
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
  const pollEnabled = ready && !allStepsComplete;

  // Jira polling — refresh ticket every 30s while the page is open and
  // not all steps are done.
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
      if (Date.now() - pollLastChecked > 15_000) refresh();
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

  // Live-label tick — bumps every second so "Live · 5s ago" stays current.
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
  // Pauses when the page is hidden and stops once all steps are ticked.
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
      setCelebration("Build ready in TestFlight — install the latest HeyBlip Beta build.");
      const timeout = setTimeout(() => setCelebration(null), 8000);
      prevBuildSuccessRef.current = true;
      return () => clearTimeout(timeout);
    }
    if (!isSuccessNow) {
      prevBuildSuccessRef.current = false;
    }
  }, [buildChip, ready]);

  // Celebration banner when AI summary or build first appears in Jira.
  useEffect(() => {
    if (!ready) {
      prevHasAgentProofRef.current = hasAgentProof;
      prevHasBuildRef.current = hasBuild;
      return;
    }
    let message: string | null = null;
    if (!prevHasAgentProofRef.current && hasAgentProof) {
      message = "The AI just posted its summary in Jira.";
    } else if (!prevHasBuildRef.current && hasBuild) {
      message = "Build is named — you can test now.";
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
  // Step 4 is "Write pass or fail" (always the last student step).
  const isStep4 = studentSteps.length > 0 && currentStepIndex === studentSteps.length - 1;
  const step1LocallyTicked = studentSteps[0]
    ? Boolean(checks[studentStepKey(0, studentSteps[0].title)])
    : false;
  const step2LocallyTicked = studentSteps[1]
    ? Boolean(checks[studentStepKey(1, studentSteps[1].title)])
    : false;

  // Build the tab descriptors fed to StepTabs.
  const stepTabs: StepTab[] = studentSteps.map((step, index) => {
    const key = studentStepKey(index, step.title);
    const checked = Boolean(checks[key]);
    let status: StepTab["status"] = "pending";
    if (checked) status = "done";
    else if (index === currentStepIndex) status = "current";
    return { key, label: shortStepLabel(step, index), status };
  });

  const currentStepTabCaption = currentStep
    ? stepCaption({
        step: currentStep,
        index: currentStepIndex,
        checked: Boolean(checks[currentStepKey]),
        hasAgentProof,
        hasBuild,
      })
    : "";

  const localNote = !hasAgentProof && step1LocallyTicked
    ? "You ticked step 1, but Jira still has no AI summary. Refresh to recheck."
    : hasAgentProof && !hasBuild && step2LocallyTicked
      ? "You ticked step 2, but Jira still has no build/commit named. Refresh to recheck."
      : "";

  const focusTone =
    allStepsComplete
      ? "border-emerald-300/45 bg-emerald-300/10"
      : !hasAgentProof || !hasBuild
        ? "border-amber-300/40 bg-amber-300/5"
        : "border-[var(--accent)]/45 bg-[var(--accent)]/10";

  // Primary CTA copy for each step. Step 4 has no CTA — the Submit findings
  // button inside the FindingsPanel acts as the primary action.
  const ctaCopy =
    currentStepIndex === 0
      ? "I've read it — next step"
      : currentStepIndex === 1
        ? "I've installed it — next step"
        : currentStepIndex === 2
          ? "I've tried it — next step"
          : "";

  function jumpToTab(index: number) {
    const target = studentSteps[index];
    if (!target) return;
    if (index === currentStepIndex) {
      const key = studentStepKey(index, target.title);
      setChecks((current) => ({ ...current, [key]: !current[key] }));
      return;
    }
    if (index < currentStepIndex) {
      // Untick all steps from `index` onward so this becomes the active one.
      setChecks((current) => {
        const next = { ...current };
        for (let i = index; i < studentSteps.length; i++) {
          const s = studentSteps[i];
          if (!s) continue;
          next[studentStepKey(i, s.title)] = false;
        }
        return next;
      });
      return;
    }
    // index > currentStepIndex — auto-tick the current step so the next one
    // becomes active. Don't skip past the next one — the focus card model
    // assumes the user moves forward one at a time.
    if (currentStep) {
      setChecks((current) => ({ ...current, [currentStepKey]: true }));
    }
  }

  // Sticky bottom action bar — mobile Step 4 only, when a verdict card
  // is present and the user hasn't already transitioned.
  const stickyBarActive =
    isStep4 && findingsState.kind === "ready" && transitionState.kind !== "done";

  return (
    // min-w-0 + w-full + overflow-x-hidden so the page can't be
    // horizontally scrolled by accidentally-wide content (long SHAs,
    // diagnostic strings, etc.). body is `flex flex-col` so main is a
    // flex item with default min-width:auto — without min-w-0 it
    // expands to its content's min-content width on narrow phones.
    <main className="mesh-gradient min-h-screen w-full min-w-0 overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div
        className={`mx-auto w-full min-w-0 max-w-4xl px-4 sm:px-6 pt-5 ${
          stickyBarActive ? "pb-32 md:pb-12" : "pb-12"
        }`}
      >
        {ready && data ? (
          <>
            <QueueBreadcrumb accessParam={accessParam} currentIssueKey={data.issueKey} />

            {/* Ticket identity row — purple key + status pill + build chip + large title. */}
            <header className="mb-5">
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                <span className="text-[0.78rem] font-extrabold tracking-wide text-[var(--accent-light)]">
                  {data.issueKey}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(data.status || "")}`}
                >
                  {data.status || "—"}
                </span>
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
                        <span
                          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${buildChipDotClass(
                            buildChip.kind,
                          )} opacity-75`}
                        />
                        <span
                          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${buildChipDotClass(
                            buildChip.kind,
                          )}`}
                        />
                      </span>
                    ) : (
                      <span
                        className={`inline-flex h-1.5 w-1.5 rounded-full ${buildChipDotClass(buildChip.kind)}`}
                      />
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
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-light)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/15"
                    title="Buddy is checking Jira every 30 seconds. Click to refresh now."
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-light)] opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-light)]" />
                    </span>
                    Live · {pollAgeLabel}
                  </button>
                ) : null}
              </div>
              <h1
                className="break-words text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-4xl"
                style={textWrapStyle}
              >
                {data.summary || "(no summary)"}
              </h1>
            </header>

            <div className="mb-6">
              <StepTabs
                steps={stepTabs}
                currentIndex={currentStepIndex}
                caption={currentStepTabCaption}
                onSelect={jumpToTab}
              />
            </div>

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

            <FocusCard
              stepIndex={currentStepIndex}
              totalSteps={Math.max(studentSteps.length, 1)}
              title={currentStep ? currentStep.title : "Write the result in Jira"}
              subtitle={<InlineMarkdown value={currentStep?.body || "Add the final PASS or FAIL result to Jira."} />}
              okWhen={currentStep?.pass ? <InlineMarkdown value={currentStep.pass} /> : undefined}
              offWhenIf={currentStep?.fail ? <InlineMarkdown value={currentStep.fail} /> : undefined}
              liveLabel={pollEnabled ? `Live · ${pollAgeLabel}` : undefined}
              toneClass={focusTone}
            >
              {/* Status drift notice — fix is in but Jira didn't move the ticket out of To Do. */}
              {humanTestPlan.agentUpdate.found
                && humanTestPlan.agentUpdate.buildOrCommit
                && /^to do$|^todo$|^open$|^backlog$/i.test(data.status || "") ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Heads up: the fix is merged but Jira didn&apos;t move the ticket out of{" "}
                    <span className="font-semibold">To Do</span>. PM/Cowork will fix the status — your testing is still valid.
                  </span>
                </p>
              ) : null}

              {/* Already-Done drift — ticket is marked Done in Jira but
                  Human Final Review never got cleared past Ready/Failed.
                  Hint at the drift so John doesn't waste time re-verifying
                  a closed ticket without knowing it's closed. */}
              {/^done$/i.test(data.status || "")
                && !/passed/i.test(data.customFields.humanFinalReview || "") ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-sky-300/35 bg-sky-300/10 px-4 py-3 text-sm leading-6 text-sky-100"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Jira already has this ticket as <span className="font-semibold">Done</span>, but Human Final Review is still{" "}
                    <span className="font-semibold">{data.customFields.humanFinalReview || "Ready"}</span>.
                    Either the field drifted after merge or someone closed the ticket early. No new test needed — flag PM if this looks wrong.
                  </span>
                </p>
              ) : null}

              {/* Step-specific body. */}
              {currentStepIndex === 0 ? (
                <div className="grid gap-4">
                  <AgentTestSummaryPanel agentUpdate={humanTestPlan.agentUpdate} />
                  {/* Generate AI Summary — only when no summary exists yet
                      AND the ticket is mid-flight (Verifying / In Progress
                      / In Review). To Do tickets keep the existing
                      Send to Codex/Claude flow below. */}
                  {!hasAgentProof && shouldShowGenerateButton(data.status) ? (
                    <GenerateSummaryButton issueKey={data.issueKey} accessParam={accessParam} />
                  ) : null}
                  <PastHumanTestResultsPanel results={humanTestResults} />
                </div>
              ) : currentStepIndex === 1 ? (
                <div className="grid gap-4">
                  <AgentTestSummaryChip agentUpdate={humanTestPlan.agentUpdate} />
                  <PastHumanTestResultsPanel results={humanTestResults} />
                </div>
              ) : currentStepIndex === 2 ? (
                <div className="grid gap-4">
                  {/* Step 3 is the action step — show the full numbered
                      plan inline so the user has the test instructions
                      right in front of them, no chip to tap. */}
                  <AgentTestSummaryPanel agentUpdate={humanTestPlan.agentUpdate} />
                  <PastHumanTestResultsPanel results={humanTestResults} />
                </div>
              ) : (
                <div className="grid gap-4">
                  {hasAgentProof && hasBuild ? (
                    <FindingsPanel
                      findingsText={findingsText}
                      setFindingsText={setFindingsText}
                      evidenceText={evidenceText}
                      setEvidenceText={setEvidenceText}
                      attachments={pendingAttachments}
                      onAttachmentsChange={setPendingAttachments}
                      state={findingsState}
                      transitionState={transitionState}
                      onSubmit={submitFindings}
                      onMarkDone={() => runTransition("mark-done")}
                      onReopen={() => runTransition("reopen")}
                      onNeedMoreInfo={dismissFindings}
                      onDismissError={() => setFindingsState({ kind: "idle" })}
                      stickyActions={stickyBarActive}
                    />
                  ) : null}
                  <PastHumanTestResultsPanel results={humanTestResults} />
                  <AgentTestSummaryChip agentUpdate={humanTestPlan.agentUpdate} />
                </div>
              )}

              {localNote ? (
                <p className="mt-4 flex items-center gap-2 rounded-md border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                  <RefreshCcw size={14} />
                  {localNote}
                </p>
              ) : null}

              {/* Send-to-AI starter buttons — only when the AI hasn't started yet. */}
              {!hasAgentProof ? (
                <div className="mt-5 grid grid-cols-2 gap-2">
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

              {/* Primary "I've done this step" CTA — steps 1-3 only. */}
              {currentStep && ctaCopy ? (
                <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: true }))}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)]"
                  >
                    {ctaCopy}
                    <ArrowRight size={16} strokeWidth={2.4} />
                  </button>
                  <span className="text-xs text-[var(--muted)]">
                    Just ticks the checklist here — Jira changes only on Step 4.
                  </span>
                </div>
              ) : null}
            </FocusCard>

            <AskBuddyInline
              speech={mascotSpeech}
              sourceLabel={mascotSourceLabel}
              sourceHint={mascotSourceHint}
              isLoading={coachState.status === "loading"}
              expanded={askExpanded}
              onToggle={() => setAskExpanded((value) => !value)}
              onAsk={loadCoach}
            />

            <section className="mt-7 grid gap-2.5">
              <DisclosurePanel title="What this fix is about" icon={<Sparkles size={18} />}>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border)] bg-black/20 p-4 lg:col-span-2">
                    <p className="text-lg font-bold text-white">{workRecipe.kind}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{workRecipe.risk}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                      <span className="font-semibold text-white">Testing:</span> {workRecipe.testingPosture}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-black/20 p-4">
                    <p className="text-sm font-bold text-white">Can the AI call it done?</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{workRecipe.proofAuthority.summary}</p>
                  </div>
                </div>
              </DisclosurePanel>

              <DisclosurePanel title="Where do I need to test this?" icon={<MonitorSmartphone size={18} />}>
                <p className="text-sm leading-6 text-[var(--muted-strong)]">
                  {realPhoneRequired
                    ? "Final pass needs the named phone/TestFlight evidence. Use simulator only for the parts that do not depend on APNs, BLE, background wake, or two-account behavior."
                    : "This looks simulator-first from Jira. Use phones only if the acceptance criteria add APNs, BLE, background, or two-account delivery."}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {surfaceCards.map((note) => {
                    const Icon = note.needsHumanDevice
                      ? Smartphone
                      : note.label.toLowerCase().includes("simulator")
                        ? MonitorSmartphone
                        : ShieldCheck;
                    return (
                      <div
                        key={note.label}
                        className={`rounded-xl border p-4 ${
                          note.active
                            ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                            : "border-[var(--border)] bg-black/20"
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

              <DisclosurePanel title="See the AI's instructions for this ticket" icon={<MessageSquareText size={18} />}>
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
                      <div key={field.fieldId} className="rounded-xl border border-[var(--border)] bg-black/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-white">{field.label}</p>
                          <span className="rounded-md border border-[var(--border)] bg-black/25 px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                            {field.fieldId}
                          </span>
                        </div>
                        <p
                          className={`mt-2 text-sm font-bold leading-6 ${
                            field.empty ? "text-amber-200" : "text-[var(--accent-light)]"
                          }`}
                          style={textWrapStyle}
                        >
                          Current value: {humaniseTimestamps(decodeHtmlEntities(field.value))}
                        </p>
                        {help ? (
                          <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{help.plain}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </DisclosurePanel>

              <DisclosurePanel title="Debug details" icon={<ListChecks size={18} />}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] bg-black/20 p-5">
                    <p className="text-sm font-bold text-white">
                      Loop stage: {data.customFields.loopStage || "Not set in Jira"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                      Proof recipe:{" "}
                      {proofRecipe.missingCount
                        ? `${proofRecipe.missingCount} missing detail${
                            proofRecipe.missingCount === 1 ? "" : "s"
                          }`
                        : "details present"}
                    </p>
                    <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3">
                      {loopStages.map((stage, index) => (
                        <div
                          key={stage}
                          className={`flex min-h-[2.75rem] items-center justify-center rounded-lg border px-3 py-2 text-center text-xs font-semibold leading-snug ${
                            index <= stageIndex
                              ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-white"
                              : "border-[var(--border)] bg-black/20 text-[var(--muted-strong)]"
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
                      <IssueLinkRow
                        issueUrl={data.issueUrl}
                        key={`${link.key}-${link.relationship}-${index}`}
                        link={link}
                      />
                    ))}
                  </div>
                </div>
              </DisclosurePanel>

              <DisclosurePanel
                title="Ticket actions"
                icon={<Settings size={18} />}
                badge="Open Jira · Mark anyway · Clear ticks"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href={data.issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-black/20 p-4 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <ExternalLink size={16} className="text-[var(--accent-light)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">Open this ticket in Jira</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--muted-strong)]">
                        Opens {data.issueKey} in a new tab.
                      </p>
                    </div>
                  </a>
                  {currentStep ? (
                    <button
                      type="button"
                      onClick={() =>
                        setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))
                      }
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-black/20 p-4 text-left transition-colors hover:border-[var(--border-strong)]"
                    >
                      <Check size={16} className="text-emerald-300" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">Mark done anyway</p>
                        <p className="mt-0.5 text-xs leading-5 text-[var(--muted-strong)]">
                          Local-only override — ticks this step without writing to Jira. Useful when you want to skip the AI verification flow on the current step.
                        </p>
                      </div>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => data && setChecks(buildEmptyChecks(data))}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-black/20 p-4 text-left transition-colors hover:border-[var(--border-strong)]"
                  >
                    <RefreshCcw size={16} className="text-sky-200" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">Clear all ticks</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--muted-strong)]">
                        Resets every step on this page. Jira is not touched.
                      </p>
                    </div>
                  </button>
                </div>
              </DisclosurePanel>
            </section>

            <p className="mt-8 text-center text-[0.72rem] text-[var(--muted)]">
              Buddy refreshes every 30s while this page is open.
            </p>
          </>
        ) : (
          <ErrorPanel state={state} accessParam={accessParam} />
        )}
      </div>

      {/* Sticky bottom action bar — mobile + Step 4 + verdict present. */}
      {stickyBarActive && findingsState.kind === "ready" ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 backdrop-blur md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 px-4 py-3">
            <VerdictActionButtons
              verdict={findingsState.body.verdict}
              transitionState={transitionState}
              onMarkDone={() => runTransition("mark-done")}
              onReopen={() => runTransition("reopen")}
              onNeedMoreInfo={dismissFindings}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
