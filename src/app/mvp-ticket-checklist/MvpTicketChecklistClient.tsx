"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  HelpCircle,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Loader2,
  MessageSquareText,
  Minus,
  Clock3,
  X as XIcon,
  MonitorSmartphone,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TicketCheck,
  Users,
} from "lucide-react";
import type { ChecklistViewModel, HumanTestResultViewModel, JiraChecklistResult } from "@/lib/mvp-ticket-checklist";
import { capitalizeFirst, descriptionExcerpt, findManualBugStep, shortTestInstruction } from "@/lib/checklist-helpers";

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

type FindingsVerdict = {
  verdict: "pass" | "fail" | "inconclusive";
  reasoning: string;
  next_step: string;
  evidence_supports_fix: boolean | null;
  concerns: string[];
};

type FindingsBody =
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

type FindingsState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ready"; body: Extract<FindingsBody, { status: "ready" }> }
  | { kind: "error"; message: string };

type TransitionState =
  | { kind: "idle" }
  | { kind: "submitting"; action: "mark-done" | "reopen" }
  | { kind: "done"; action: "mark-done" | "reopen" }
  | { kind: "error"; message: string };

const COACH_REQUEST_TIMEOUT_MS = 100000;
const FINDINGS_REQUEST_TIMEOUT_MS = 30_000;
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
    humanTestRequestedItems: [],
    humanTestRequestedPreamble: "",
    sentryWatchIds: [],
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
        ? "Read what the AI tested"
        : aiDoneNoFormalPlan
          ? "AI's done — no formal test plan was posted"
          : notStarted
            ? "Send this to an AI to start"
            : "AI is still coding this",
      body: plan.agentUpdate.found
        ? "The AI's summary is below — you don't need to leave Buddy. It tells you what changed, the build to install, and the exact thing to look for on your phone."
        : aiDoneNoFormalPlan
          ? "The fix is merged but nobody posted a structured 'Agent Test Update' comment. Use the ticket description (and your judgment) as the test guide. Step 3 below pulls it through."
          : notStarted
            ? "No AI has picked this up yet. Tap a green button below to send the prompt to Codex or Claude — the AI will do the coding and post a summary back to Jira."
            : "An AI is writing the fix. When it posts a summary in Jira (a comment titled 'Agent Test Update'), this card turns green and it's your turn.",
      pass: plan.agentUpdate.found
        ? "The summary below has real commands or a build number — not [Passed / Failed] placeholders."
        : aiDoneNoFormalPlan
          ? "You've read the ticket description and you understand what changed."
          : notStarted
            ? "After you send it: an AI takes the prompt, does the work, and posts a summary in Jira."
            : "The AI's summary appears in Jira with real values, not template placeholders.",
      fail: plan.agentUpdate.found
        ? "The summary is vague, missing the build, or still has [Passed / Failed] placeholders."
        : aiDoneNoFormalPlan
          ? "The ticket description doesn't have enough info to test it. Reopen with what's missing."
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
      // When the AI gave us a plan, lean on it — the user is testing what the
      // AI wrote, not a generic track template. The full plan lives in step 1's
      // panel; we keep step 3 short so this card stays scannable. If the AI
      // never posted a plan but the ticket is already in Verifying/Done, fall
      // back to the ticket description's first paragraph — it's the user's
      // best in-Buddy test guide.
      body: aiPhoneInstruction
        ? `${shortTestInstruction(aiPhoneInstruction, workKind)} ${aiPhonePlan.length > 1 ? "Full plan in step 1's panel above." : ""}`.trim()
        : shortTestInstruction(
            phoneStep?.doThis ||
              data.recommendedAction.steps[0] ||
              (aiDoneNoFormalPlan ? descriptionExcerpt(data.descriptionText) : "") ||
              "Run the test written on Jira.",
            workKind,
          ),
      pass: capitalizeFirst(
        aiPhonePassHint || phoneStep?.passMeans || "The bug no longer happens.",
      ),
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

// Reduces the verbose "Build/commit: PR ... head commit `97e6ddc` ..." line
// the AI writes to a single short token suitable for a chip — "build 65" or
// "commit e027d3e". Falls back to the raw value (truncated) when nothing
// concrete jumps out.
function shortBuildOrCommitChip(raw: string): { label: string; full: string } | null {
  if (!raw) return null;
  const buildMatch = raw.match(/\bbuild\s+(\d+[a-z]?)\b/i);
  if (buildMatch) {
    return { label: `Fix is in: build ${buildMatch[1]}`, full: raw };
  }
  // 7-12 char hex chunk surrounded by backticks or whitespace = a commit SHA
  // worth showing. Skip BDEV/HEY ticket keys so we don't display BDEV-493 here.
  const shaMatch = raw.match(/(?:\s|`|^)([0-9a-f]{7,12})(?:\s|`|$)/i);
  if (shaMatch && !/^BDEV-/i.test(shaMatch[1])) {
    return { label: `Fix is in: commit ${shaMatch[1]}`, full: raw };
  }
  // Last-resort: just show "Build/commit on file" — better than nothing for
  // edge cases like "PR https://github.com/.../pull/391".
  if (/pr\s*[#]?\d+|pull\/\d+/i.test(raw)) {
    const prMatch = raw.match(/pull\/(\d+)|PR\s*#?(\d+)/i);
    const prNum = prMatch ? prMatch[1] || prMatch[2] : "";
    return { label: prNum ? `Fix is in: PR #${prNum}` : "Build/commit named", full: raw };
  }
  return null;
}

// Plain-English relative time. "just now", "2 hours ago", "yesterday",
// "3 days ago". Falls back to a date string for older timestamps.
function plainRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
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

// Inline panel showing what the AI tested + the AI's plain-English plan
// for John/Tay. Renders inside the active step card so the user no longer
// needs to hop to Jira to see the test plan. Only mounts when the AI has
// actually posted an Agent Test Update.

// Classifies a surface result string (e.g. "Verified on iPhone 17 Pro sim",
// "N/A — client-side coalescing fix only.", "Not run") into one of four
// states so chips can carry the right color + icon + tooltip. Order matters:
// fail/N/A/not-run are detected first; anything else with content is treated
// as "passed" (someone bothered to write a result).
type SurfaceState = "passed" | "failed" | "na" | "not-run";

function classifySurfaceResult(value: string): SurfaceState {
  const v = (value || "").toLowerCase().trim();
  if (!v) return "not-run";
  if (/\b(fail(ed|s|ure)?|broken|blocked|red\b|error)\b/.test(v)) return "failed";
  if (/^n\.?\/?a\b|\bnot applicable\b|client-side.+only|server-side.+only/.test(v)) return "na";
  if (/\b(not run|not reported|not tested|skipped|deferred|pending|tbd)\b/.test(v)) return "not-run";
  return "passed";
}

const SURFACE_TONE: Record<SurfaceState, string> = {
  passed: "border-emerald-300/55 bg-emerald-300/15 text-emerald-50",
  failed: "border-red-300/55 bg-red-300/15 text-red-50",
  na: "border-white/15 bg-white/[0.04] text-[var(--muted-strong)]",
  "not-run": "border-amber-300/45 bg-amber-300/10 text-amber-100",
};

const SURFACE_ICON: Record<SurfaceState, typeof Check> = {
  passed: Check,
  failed: XIcon,
  na: Minus,
  "not-run": Clock3,
};

const SURFACE_TITLE: Record<SurfaceState, string> = {
  passed: "Passed",
  failed: "Failed",
  na: "Not applicable",
  "not-run": "Not run yet",
};

function AgentTestSummaryPanel({
  agentUpdate,
}: {
  agentUpdate: ChecklistViewModel["humanTestPlan"]["agentUpdate"];
}) {
  if (!agentUpdate.found) return null;
  const buildChip = shortBuildOrCommitChip(agentUpdate.buildOrCommit);
  const items = agentUpdate.humanTestRequestedItems;
  const fallbackHumanTest =
    items.length === 0 && agentUpdate.humanTestRequested
      ? agentUpdate.humanTestRequested
      : "";
  const sentryIds = agentUpdate.sentryWatchIds;
  const surfaceChips = (
    [
      { label: "Automated", value: agentUpdate.surfaceResults.automated },
      { label: "Simulator", value: agentUpdate.surfaceResults.simulator },
      { label: "Worker smoke", value: agentUpdate.surfaceResults.workerSmoke },
    ] as const
  ).filter((entry) => {
    const v = (entry.value || "").trim();
    return v && !/^not reported$/i.test(v);
  });
  const sourceLabel = agentUpdate.source
    ? [agentUpdate.source.author, plainRelativeTime(agentUpdate.source.created)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--accent-light)]">
        <Sparkles size={13} />
        What the AI tested
      </div>

      {buildChip ? (
        <div
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/45 bg-emerald-300/10 px-3 py-1.5 text-sm font-semibold text-emerald-100"
          title={buildChip.full}
        >
          <Check size={14} strokeWidth={3} />
          {buildChip.label}
        </div>
      ) : null}

      {items.length > 0 || fallbackHumanTest ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold text-white">What to do on the phone</h3>
          {agentUpdate.humanTestRequestedPreamble ? (
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted-strong)]">
              {agentUpdate.humanTestRequestedPreamble}
            </p>
          ) : null}
          {items.length > 0 ? (
            <ol className="mt-2 grid list-none gap-3 pl-0">
              {items.map((item) => (
                <li
                  key={item.number}
                  className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/25 text-xs font-bold text-[var(--accent-light)]">
                    {item.number}
                  </span>
                  <div className="min-w-0 flex-1 text-sm leading-6 text-white">
                    {item.title ? (
                      <span className="font-semibold text-white">{item.title}</span>
                    ) : null}
                    {item.title && item.body ? <span className="text-white"> — </span> : null}
                    {item.segments.length > 0
                      ? item.segments.map((segment, idx) =>
                          segment.kind === "code" ? (
                            <code
                              key={idx}
                              className="break-words rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--accent-light)]"
                            >
                              {segment.value}
                            </code>
                          ) : (
                            <span key={idx} className="text-[var(--muted-strong)]">
                              {segment.value}
                            </span>
                          ),
                        )
                      : <span className="text-[var(--muted-strong)]">{item.body}</span>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--muted-strong)]">
              {fallbackHumanTest}
            </p>
          )}
        </div>
      ) : null}

      {sentryIds.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold text-white">What to watch in Sentry</h3>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted-strong)]">
            On the next release, these alerts should drop sharply:{" "}
            {sentryIds.map((id, idx) => (
              <span key={id}>
                <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--accent-light)]">
                  {id}
                </code>
                {idx < sentryIds.length - 1 ? ", " : ""}
              </span>
            ))}
            . If they don&apos;t drop within 48 hours of the build going live, the fix didn&apos;t take.
          </p>
        </div>
      ) : null}

      {surfaceChips.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold text-white">What the AI checked</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {surfaceChips.map((chip) => {
              const state = classifySurfaceResult(chip.value);
              const tone = SURFACE_TONE[state];
              const Icon = SURFACE_ICON[state];
              const stateLabel = SURFACE_TITLE[state];
              return (
                <span
                  key={chip.label}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
                  title={`${stateLabel}: ${chip.value}`}
                >
                  <Icon size={12} strokeWidth={3} aria-hidden />
                  <span className="font-bold uppercase tracking-wide">{chip.label}</span>
                  <span className="truncate font-medium normal-case">{chip.value}</span>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><Check size={9} strokeWidth={3} className="text-emerald-200" /> passed</span>
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1"><Minus size={9} strokeWidth={3} className="text-[var(--muted)]" /> not applicable</span>
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={9} strokeWidth={3} className="text-amber-200" /> not run yet</span>
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1"><XIcon size={9} strokeWidth={3} className="text-red-200" /> failed</span>
          </p>
        </div>
      ) : null}

      {sourceLabel ? (
        <p className="mt-4 text-[11px] uppercase tracking-wide text-[var(--muted)]">
          From {sourceLabel}
        </p>
      ) : null}
    </div>
  );
}

// "Write your findings" panel — the new Step 4 input that turns human
// testing into a Jira comment + AI verdict + 3-action card. Lives below
// the existing pass/fail boxes on Step 4. Renders one of:
//   - the empty form (default)
//   - a loading state (~10s while Claude judges)
//   - the verdict card with 3 buttons (Mark Done / Reopen / Need more info)
//   - an error state with a retry option
function FindingsPanel({
  findingsText,
  setFindingsText,
  evidenceText,
  setEvidenceText,
  state,
  transitionState,
  onSubmit,
  onMarkDone,
  onReopen,
  onNeedMoreInfo,
  onDismissError,
}: {
  findingsText: string;
  setFindingsText: (value: string) => void;
  evidenceText: string;
  setEvidenceText: (value: string) => void;
  state: FindingsState;
  transitionState: TransitionState;
  onSubmit: () => void;
  onMarkDone: () => void;
  onReopen: () => void;
  onNeedMoreInfo: () => void;
  onDismissError: () => void;
}) {
  const canSubmit = findingsText.trim().length > 0 && state.kind !== "submitting";
  const submitting = state.kind === "submitting";
  const ready = state.kind === "ready";
  const verdict = ready ? state.body.verdict : null;
  const buildOrCommit = ready ? state.body.buildOrCommit : "";

  return (
    <div className="mt-5 rounded-2xl border border-white/15 bg-black/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--accent-light)]">
        <MessageSquareText size={13} />
        Write your findings
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
        Tell Buddy what happened on your phone. Buddy posts it to Jira and asks the AI
        whether this looks done.
      </p>

      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-white">What happened when you tested?</span>
          <textarea
            value={findingsText}
            onChange={(event) => setFindingsText(event.target.value)}
            placeholder="e.g. I backgrounded the app for 2 minutes, brought it back, and only one reconnect line appeared in the log."
            rows={3}
            disabled={submitting}
            className="mt-1.5 block w-full resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
            style={{ minHeight: 72 }}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white">
            Paste any logs, Sentry IDs, or evidence{" "}
            <span className="font-normal text-[var(--muted)]">(optional)</span>
          </span>
          <textarea
            value={evidenceText}
            onChange={(event) => setEvidenceText(event.target.value)}
            placeholder="Drag-and-drop or paste — Sentry IDs like APPLE-IOS-XX, debug log lines, anything."
            rows={5}
            disabled={submitting}
            className="mt-1.5 block w-full resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
            style={{ minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-bold text-black transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Sending to AI...
            </>
          ) : (
            <>
              <Send size={15} strokeWidth={2.5} />
              Submit findings
            </>
          )}
        </button>
        {!canSubmit && !submitting ? (
          <span className="text-xs text-[var(--muted)]">Write what you saw to enable submit.</span>
        ) : null}
      </div>

      {state.kind === "error" ? (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-300/45 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          <span className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {state.message}
          </span>
          <button
            type="button"
            onClick={onDismissError}
            className="inline-flex items-center gap-1 rounded-md border border-red-300/50 bg-red-300/10 px-2 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/20"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {ready && verdict ? (
        <VerdictCard
          verdict={verdict}
          buildOrCommit={buildOrCommit}
          source={state.body.source}
          transitionState={transitionState}
          onMarkDone={onMarkDone}
          onReopen={onReopen}
          onNeedMoreInfo={onNeedMoreInfo}
        />
      ) : null}
    </div>
  );
}

// The AI verdict card — slides in after submit. Shows the AI's call
// (pass / fail / inconclusive), the plain-English reasoning, the
// one-line next step, and the 3 action buttons. All 3 buttons are
// always shown so the human can override the AI.
function VerdictCard({
  verdict,
  buildOrCommit,
  source,
  transitionState,
  onMarkDone,
  onReopen,
  onNeedMoreInfo,
}: {
  verdict: FindingsVerdict;
  buildOrCommit: string;
  source: "openrouter" | "local-fallback";
  transitionState: TransitionState;
  onMarkDone: () => void;
  onReopen: () => void;
  onNeedMoreInfo: () => void;
}) {
  const chip = verdictChipCopy(verdict.verdict);
  const isSubmitting = transitionState.kind === "submitting";
  const doneAction = transitionState.kind === "done" ? transitionState.action : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`mt-5 rounded-2xl border p-4 sm:p-5 ${chip.cardClass}`}
      role="region"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${chip.chipClass}`}>
          {chip.icon}
          {chip.label}
        </span>
        {source === "local-fallback" ? (
          <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Local fallback
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-base leading-7 text-white">{verdict.reasoning}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
        <span className="font-semibold text-white">Next step:</span> {verdict.next_step}
      </p>

      {verdict.concerns.length > 0 ? (
        <ul className="mt-3 grid list-none gap-1.5 pl-0 text-xs text-[var(--muted-strong)]">
          {verdict.concerns.map((concern, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="mt-1 inline-flex h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" />
              <span>{concern}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onMarkDone}
          disabled={isSubmitting || doneAction === "mark-done"}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            verdict.verdict === "pass"
              ? "bg-emerald-300 text-black hover:bg-emerald-200"
              : "border border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
          }`}
        >
          {isSubmitting && transitionState.kind === "submitting" && transitionState.action === "mark-done" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : doneAction === "mark-done" ? (
            <Check size={15} strokeWidth={3} />
          ) : (
            <ThumbsUp size={15} />
          )}
          {doneAction === "mark-done" ? "Marked done" : "Mark Done"}
        </button>
        <button
          type="button"
          onClick={onReopen}
          disabled={isSubmitting || doneAction === "reopen"}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            verdict.verdict === "fail"
              ? "bg-amber-300 text-black hover:bg-amber-200"
              : "border border-amber-300/40 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
          }`}
        >
          {isSubmitting && transitionState.kind === "submitting" && transitionState.action === "reopen" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : doneAction === "reopen" ? (
            <Check size={15} strokeWidth={3} />
          ) : (
            <ThumbsDown size={15} />
          )}
          {doneAction === "reopen" ? "Reopened" : "Reopen for fix"}
        </button>
        <button
          type="button"
          onClick={onNeedMoreInfo}
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HelpCircle size={15} />
          Need more info
        </button>
      </div>

      {transitionState.kind === "error" ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-300/45 bg-red-300/10 px-3 py-2 text-xs text-red-100">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {transitionState.message}
        </p>
      ) : null}

      {doneAction === "mark-done" ? (
        <div className="mt-4 rounded-xl border border-emerald-300/50 bg-emerald-300/15 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-300/30">
              <TicketCheck size={20} strokeWidth={2.5} className="text-emerald-100" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white">
                Ticket closed in Jira <span aria-hidden>✓</span>
              </p>
              <p className="mt-1 text-sm text-emerald-50/90">
                Verification comment posted{buildOrCommit ? ` against ${buildOrCommit}` : ""}. You&apos;re free to move on.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-emerald-200"
                >
                  <ArrowUp size={13} strokeWidth={2.5} />
                  See Buddy&apos;s next pick
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : doneAction === "reopen" ? (
        <div className="mt-4 rounded-xl border border-amber-300/50 bg-amber-300/15 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300/30">
              <RefreshCcw size={18} strokeWidth={2.5} className="text-amber-100" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white">
                Sent back to engineering
              </p>
              <p className="mt-1 text-sm text-amber-50/90">
                The ticket is back in In Progress — the next coding-agent will pick it up.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {buildOrCommit ? (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Build judged against: {buildOrCommit}
        </p>
      ) : null}
    </motion.div>
  );
}

function verdictChipCopy(verdict: FindingsVerdict["verdict"]): {
  label: string;
  icon: ReactNode;
  chipClass: string;
  cardClass: string;
} {
  if (verdict === "pass") {
    return {
      label: "AI thinks this is done",
      icon: <ThumbsUp size={13} />,
      chipClass: "bg-emerald-300/20 text-emerald-100",
      cardClass: "border-emerald-300/40 bg-emerald-300/5",
    };
  }
  if (verdict === "fail") {
    return {
      label: "AI thinks this needs more work",
      icon: <ThumbsDown size={13} />,
      chipClass: "bg-amber-300/20 text-amber-100",
      cardClass: "border-amber-300/40 bg-amber-300/5",
    };
  }
  return {
    label: "AI needs more info",
    icon: <HelpCircle size={13} />,
    chipClass: "bg-sky-300/20 text-sky-100",
    cardClass: "border-sky-300/40 bg-sky-300/5",
  };
}

// Renders the latest "Human Test Result" comment (if any) so the
// person testing now sees what previous testers (or they themselves)
// already wrote — no Jira hop required.
function PastHumanTestResultsPanel({ results }: { results: HumanTestResultViewModel[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!results.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--muted-strong)]">
          <ListChecks size={13} />
          Past test results ({results.length})
        </span>
        {results.length > 1 ? (
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Newest first
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {results.slice(0, 3).map((result) => {
          const tone = resultTone(result.outcome);
          const isExpanded = expandedId === result.commentId;
          return (
            <div
              key={result.commentId}
              className={`rounded-xl border p-3 text-sm leading-6 ${tone.border} ${tone.bg}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tone.chip}`}>
                  {tone.icon}
                  {tone.label}
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  {result.verifier || result.author} · {plainRelativeTime(result.created)}
                </span>
              </div>
              {result.aiRecommendation ? (
                <p className="mt-2 text-sm text-white">
                  <span className="font-semibold">AI: </span>
                  {result.aiRecommendation}
                  {result.aiReasoning ? ` — ${truncate(result.aiReasoning, 140)}` : ""}
                </p>
              ) : null}
              {result.findings ? (
                <p className="mt-1 text-sm text-[var(--muted-strong)]">
                  {isExpanded ? result.findings : truncate(result.findings, 140)}
                </p>
              ) : null}
              {(result.findings && result.findings.length > 140) ||
              (result.aiReasoning && result.aiReasoning.length > 140) ||
              result.evidence ? (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : result.commentId)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-200 transition-colors hover:text-sky-100"
                >
                  <ChevronDown size={12} className={isExpanded ? "rotate-180" : ""} />
                  {isExpanded ? "Hide full comment" : "Show full comment"}
                </button>
              ) : null}
              {isExpanded && result.evidence ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[12px] leading-5 text-[var(--muted-strong)]">
                  {result.evidence}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function resultTone(outcome: HumanTestResultViewModel["outcome"]): {
  label: string;
  icon: ReactNode;
  chip: string;
  bg: string;
  border: string;
} {
  if (outcome === "pass") {
    return {
      label: "Passed",
      icon: <ThumbsUp size={11} />,
      chip: "bg-emerald-300/20 text-emerald-100",
      bg: "bg-emerald-300/5",
      border: "border-emerald-300/30",
    };
  }
  if (outcome === "fail") {
    return {
      label: "Failed",
      icon: <ThumbsDown size={11} />,
      chip: "bg-amber-300/20 text-amber-100",
      bg: "bg-amber-300/5",
      border: "border-amber-300/30",
    };
  }
  return {
    label: outcome === "inconclusive" ? "Inconclusive" : "Result",
    icon: <HelpCircle size={11} />,
    chip: "bg-sky-300/20 text-sky-100",
    bg: "bg-sky-300/5",
    border: "border-sky-300/30",
  };
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export default function MvpTicketChecklistClient({ state, accessParam }: Props) {
  const data = isReadyState(state) ? state.data : null;
  const ready = Boolean(data);
  const issueKey = data?.issueKey ?? state.issueKey;
  const workRecipe = data?.workRecipe ?? emptyWorkRecipe;
  const proofRecipe = data?.proofRecipe ?? emptyProofRecipe;
  const humanTestPlan = data?.humanTestPlan ?? emptyHumanTestPlan;
  const humanTestResults: HumanTestResultViewModel[] = data?.humanTestResults ?? [];
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
  const [findingsText, setFindingsText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [findingsState, setFindingsState] = useState<FindingsState>({ kind: "idle" });
  const [transitionState, setTransitionState] = useState<TransitionState>({ kind: "idle" });
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
    coachMatchesCurrentStep && coachState.source === "haiku"
      ? "Haiku"
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
      const response = await fetch("/api/mvp-ticket-checklist/findings", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: issueKey,
          access: accessParam,
          findings: trimmed,
          evidence: evidenceText.trim(),
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
        | { status: "ready"; action: string }
        | { status: "error"; message: string };

      if (!response.ok || result.status !== "ready") {
        const message = "message" in result && result.message
          ? result.message
          : "The Jira transition didn't go through. Try again.";
        setTransitionState({ kind: "error", message });
        return;
      }

      setTransitionState({ kind: "done", action });
      // Reload the ticket so the new status reflects in Buddy.
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
  // Step 4 is "Write pass or fail" (always the last student step). The
  // findings panel only appears on the active step card on Step 4 — the
  // earlier steps already have their own primary actions.
  const isStep4 = studentSteps.length > 0 && currentStepIndex === studentSteps.length - 1;
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

                  {/* Status drift notice — fix is in but Jira ticket didn't move out of To Do.
                      Doesn't block the flow; just warns the user that the ticket status will
                      catch up shortly. PM/Cowork own moving the ticket. */}
                  {humanTestPlan.agentUpdate.found
                    && humanTestPlan.agentUpdate.buildOrCommit
                    && /^to do$|^todo$|^open$|^backlog$/i.test(data.status || "") ? (
                    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>
                        Heads up: the fix is merged but Jira didn&apos;t move the ticket out of{" "}
                        <span className="font-semibold">To Do</span>. PM/Cowork will fix the
                        status — your testing is still valid.
                      </span>
                    </p>
                  ) : null}

                  {/* The "What the AI tested" panel — replaces the need to hop to Jira. */}
                  <AgentTestSummaryPanel agentUpdate={humanTestPlan.agentUpdate} />

                  {/* Past Human Test Results — what previous testers (or you) wrote.
                      Always shown when present so verifiers see priors without
                      leaving Buddy. */}
                  <PastHumanTestResultsPanel results={humanTestResults} />

                  {/* "Write your findings" panel — only on Step 4 (Result) when
                      the AI has posted a summary and Jira has named a build. */}
                  {isStep4 && hasAgentProof && hasBuild ? (
                    <FindingsPanel
                      findingsText={findingsText}
                      setFindingsText={setFindingsText}
                      evidenceText={evidenceText}
                      setEvidenceText={setEvidenceText}
                      state={findingsState}
                      transitionState={transitionState}
                      onSubmit={submitFindings}
                      onMarkDone={() => runTransition("mark-done")}
                      onReopen={() => runTransition("reopen")}
                      onNeedMoreInfo={dismissFindings}
                      onDismissError={() => setFindingsState({ kind: "idle" })}
                    />
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
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button
                        type="button"
                        onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))}
                        className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                        title="Tracks your progress on this page only — does not change anything in Jira"
                      >
                        <Check size={15} />
                        I&apos;ve done this step
                      </button>
                      <span className="text-[11px] text-[var(--muted)]">
                        Just ticks the checklist here — Jira changes only on Step 4 &ldquo;Mark Done&rdquo;.
                      </span>
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
                    {currentStep ? (
                      <button
                        type="button"
                        onClick={() => setChecks((current) => ({ ...current, [currentStepKey]: !current[currentStepKey] }))}
                        className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--muted)] transition-colors hover:text-white"
                        title={
                          hasAgentProof && hasBuild
                            ? "Local-only override — ticks this step without using the AI verification flow. Same effect as the button above."
                            : "Tick this only if you've genuinely completed this step. Jira is not touched."
                        }
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
              ? currentIssueKey
                ? `Queue is empty — you're testing ${currentIssueKey} on your own.`
                : "Nothing is ready to verify right now."
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
