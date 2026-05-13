"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

// The rounded-3xl outer container that wraps each step's body. Renders
// the consistent step header (STEP N OF M pill + Live label + heading +
// plain-English body + ok/bad criteria) then yields to children for the
// step-specific content.
//
// Subtitle accepts ReactNode so callers can mix copy + chips inline.
//
// The card itself sits on a soft black background with a thin border —
// no glassmorphism, no glow. Aesthetic borrowed from the queue mockup.

export function FocusCard({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  okWhen,
  offWhenIf,
  liveLabel,
  toneClass,
  headerExtras,
  children,
}: {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: ReactNode;
  okWhen?: ReactNode;
  offWhenIf?: ReactNode;
  liveLabel?: string;
  toneClass?: string;
  headerExtras?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-black/30 p-5 sm:p-7 ${toneClass || ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <Sparkles size={11} strokeWidth={2.4} aria-hidden />
          Step {stepIndex + 1} of {totalSteps}
        </span>
        {liveLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--accent-light)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-light)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-light)]" />
            </span>
            {liveLabel}
          </span>
        ) : null}
        {headerExtras}
      </div>

      <h2 className="break-words text-2xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <div className="mt-3 text-base leading-7 text-[var(--muted-strong)] sm:text-[1.05rem]">
          {subtitle}
        </div>
      ) : null}

      {(okWhen || offWhenIf) ? (
        <div className="mt-5 grid gap-2 text-sm leading-6">
          {okWhen ? (
            <p className="flex items-start gap-2.5 text-[var(--muted-strong)]">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-300/25 text-xs font-bold text-emerald-200">
                ✓
              </span>
              <span>
                <span className="font-semibold text-emerald-100">You&apos;ll know it worked when:</span>{" "}
                {okWhen}
              </span>
            </p>
          ) : null}
          {offWhenIf ? (
            <p className="flex items-start gap-2.5 text-[var(--muted-strong)]">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-300/25 text-xs font-bold text-red-200">
                ✗
              </span>
              <span>
                <span className="font-semibold text-red-100">Something&apos;s off if:</span>{" "}
                {offWhenIf}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
