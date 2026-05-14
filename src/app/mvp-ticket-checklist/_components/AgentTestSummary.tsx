"use client";

import { useState } from "react";
import { Check, ChevronDown, Clock3, Minus, Sparkles, X as XIcon } from "lucide-react";
import type { ChecklistViewModel } from "@/lib/mvp-ticket-checklist";
import { BUILD_CHIP_CLASSES, plainRelativeTime, shortBuildOrCommitChip } from "./shared";

// Classifies a surface result string (e.g. "Verified on iPhone 17 Pro sim",
// "N/A — client-side coalescing fix only.", "Not run") into one of four
// states so chips can carry the right color + icon + tooltip. Order matters:
// fail/N/A/not-run are detected first; anything else with content is treated
// as "passed" (someone bothered to write a result).
type SurfaceState = "passed" | "failed" | "na" | "not-run";

export function classifySurfaceResult(value: string): SurfaceState {
  const v = (value || "").toLowerCase().trim();
  if (!v) return "not-run";

  const failMatch = v.match(/\b(fail(ed|s|ure)?|broken|blocked|red\b|error)\b/);
  const passMatch = v.match(/\b(passed|all green|all good)\b/);

  // Agents commonly write headline-first reports like
  // "passed: 9 files, 133 tests. Attempted xcodebuild but toolchain blocked"
  // — the earlier signal is the actual surface result, the later "blocked"
  // is just explaining a side detail. Whichever appears first wins.
  if (failMatch && passMatch) {
    return (passMatch.index ?? Infinity) < (failMatch.index ?? Infinity) ? "passed" : "failed";
  }
  if (failMatch) return "failed";
  if (passMatch) return "passed";

  if (
    /^n\.?\/?a\b|\bnot applicable\b|\bnot required\b|\bnot needed\b|\bno .{0,40}(needed|required|changed?)\b|client-side.+only|server-side.+only/.test(
      v,
    )
  )
    return "na";
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

// Inline panel showing what the AI tested + the AI's plain-English plan
// for John/Tay. Renders inside the active step card on Step 1 so the user
// no longer needs to hop to Jira to see the test plan. Only mounts when
// the AI has actually posted an Agent Test Update.
export function AgentTestSummaryPanel({
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
    // min-w-0 + w-full so the panel can shrink inside its parent grid
    // (the "grid gap-4" wrapper on Step 1) — without it the panel's
    // children with `min-width: auto` (default for grid items) stretch
    // the panel to 2073px on a 390px viewport.
    <div className="mt-5 w-full min-w-0 border-t border-white/10 pt-5">
      {/*
        Section header. This panel is the AI's whole handover note:
        the build it shipped, the plan it wants you to run on your
        phone, what to watch in Sentry, AND a subsection further down
        called "What the AI checked" listing its own
        automated/simulator/worker results. The previous header
        "What the AI tested" overlapped with that inner subsection
        and made the body (a human test plan) look like AI test
        output. Calling it "AI's test summary" instead matches the
        canonical Jira comment heading ("Agent Test Update").
      */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--accent-light)]">
        <Sparkles size={13} aria-hidden="true" />
        AI&apos;s test summary
      </div>

      {buildChip ? (
        <div
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${BUILD_CHIP_CLASSES[buildChip.tone]}`}
          title={buildChip.full}
        >
          {buildChip.tone === "success" ? (
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Sparkles size={14} strokeWidth={3} aria-hidden="true" />
          )}
          {buildChip.label}
        </div>
      ) : null}

      {items.length > 0 || fallbackHumanTest ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold text-white">What to do on the phone</h3>
          {items.length > 0 && agentUpdate.humanTestRequestedPreamble ? (
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted-strong)]">
              {agentUpdate.humanTestRequestedPreamble}
            </p>
          ) : null}
          {items.length > 0 ? (
            // grid-cols-1 forces a single-column grid so wide content
            // inside a step doesn't expand the column track to its
            // min-content width on mobile. Without this the long
            // `main@<full-SHA>` SHA inside item #1 stretched the
            // entire page to 2110px on a 390px viewport.
            <ol className="mt-2 grid w-full min-w-0 grid-cols-1 list-none gap-3 pl-0">
              {items.map((item) => (
                <li
                  key={item.number}
                  // min-w-0 + overflow-hidden override the default
                  // `min-width: auto` on flex items so the LI can
                  // shrink even when its content has an unbreakable
                  // long token (40-char SHA).
                  className="flex min-w-0 gap-3 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/25 text-xs font-bold text-[var(--accent-light)]">
                    {item.number}
                  </span>
                  <div
                    // break-all forces breaks INSIDE any token; the
                    // previous break-words / overflow-wrap:anywhere
                    // combo wasn't aggressive enough on mobile because
                    // Tailwind's `break-words` sets overflow-wrap:
                    // break-word which only breaks between word
                    // boundaries.
                    className="min-w-0 flex-1 break-all text-sm leading-6 text-white"
                  >
                    {item.title ? (
                      <span className="font-semibold text-white">{item.title}</span>
                    ) : null}
                    {item.title && item.body ? <span className="text-white"> — </span> : null}
                    {item.segments.length > 0
                      ? item.segments.map((segment, idx) =>
                          segment.kind === "code" ? (
                            <code
                              key={idx}
                              className="box-decoration-clone rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--accent-light)] [overflow-wrap:anywhere]"
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
                <code className="box-decoration-clone rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--accent-light)]">
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
                  className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:max-w-[28rem] ${tone}`}
                  title={`${stateLabel}: ${chip.value}`}
                >
                  <Icon size={12} strokeWidth={3} aria-hidden className="shrink-0" />
                  <span className="shrink-0 font-bold uppercase tracking-wide">{chip.label}</span>
                  <span className="min-w-0 flex-1 truncate font-medium normal-case">{chip.value}</span>
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

// Single-chip collapse of the AgentTestSummaryPanel. Used on Steps 2 + 3
// so the AI summary is one tap away but not crowding the active step.
// Tap → expands to the full panel inline. Tap again → collapses.
export function AgentTestSummaryChip({
  agentUpdate,
}: {
  agentUpdate: ChecklistViewModel["humanTestPlan"]["agentUpdate"];
}) {
  const [expanded, setExpanded] = useState(false);
  if (!agentUpdate.found) return null;
  const items = agentUpdate.humanTestRequestedItems;
  const buildChip = shortBuildOrCommitChip(agentUpdate.buildOrCommit);
  const stepCount = items.length;
  const summary = [
    "AI summary",
    stepCount ? `${stepCount} step${stepCount === 1 ? "" : "s"}` : null,
    buildChip ? buildChip.label.replace(/^fix is in:\s*/i, "") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-3.5 py-1.5 text-sm font-semibold text-[var(--accent-light)] transition-colors hover:bg-[var(--accent)]/15"
      >
        <Sparkles size={13} />
        {summary}
        <ChevronDown
          size={14}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded ? (
        <div className="mt-4">
          <AgentTestSummaryPanel agentUpdate={agentUpdate} />
        </div>
      ) : null}
    </div>
  );
}
