"use client";

import { Check } from "lucide-react";

// One-row, 4-tab strip that replaces the old double-up of progress bar +
// step list. Each tab shows STEP N + short label. The current tab is
// bordered/tinted purple; completed tabs get a check icon.
//
// On mobile (<md), tabs wrap to a 2x2 grid via flex-wrap. Each tab is
// at least 44px tall so it's tappable on iPhone.

export type StepTab = {
  key: string;
  label: string;
  status: "pending" | "current" | "done";
};

export function StepTabs({
  steps,
  currentIndex,
  caption,
  onSelect,
}: {
  steps: StepTab[];
  currentIndex: number;
  caption?: string;
  onSelect: (index: number) => void;
}) {
  if (!steps.length) return null;

  return (
    <div>
      <div
        className="flex flex-wrap items-stretch gap-1.5 md:flex-nowrap"
        role="tablist"
        aria-label="Test progress"
      >
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isDone = step.status === "done";
          return (
            <button
              key={step.key}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => onSelect(index)}
              className={`group flex min-h-11 flex-1 basis-[calc(50%-0.2rem)] flex-col items-start gap-1 rounded-2xl border px-3 py-2 text-left transition-colors md:basis-0 ${
                isCurrent
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
                  : isDone
                    ? "border-[var(--border)] bg-black/20 text-[var(--muted-strong)] hover:border-[var(--border-strong)]"
                    : "border-[var(--border)] bg-black/20 text-[var(--muted)] hover:border-[var(--border-strong)]"
              }`}
            >
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${
                  isCurrent
                    ? "text-[var(--accent-light)]"
                    : isDone
                      ? "text-emerald-300"
                      : "text-[var(--muted)]"
                }`}
              >
                {isDone ? <Check size={10} strokeWidth={3} aria-hidden /> : null}
                Step {index + 1}
              </span>
              <span className="block text-[13px] font-semibold leading-tight">
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
      {caption ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{caption}</p>
      ) : null}
    </div>
  );
}
