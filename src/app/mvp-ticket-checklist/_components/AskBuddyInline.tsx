"use client";

import { motion } from "framer-motion";
import { HelpCircle, Sparkles } from "lucide-react";
import { textWrapStyle } from "./shared";

// Inline "Ask Buddy" panel that replaces the floating BlipMascotGuide mascot.
// Tap the ghost button → an inline panel slides down with the coach speech
// and an "Ask the AI" trigger. No floating widgets, no PNG mascot, no glow.
export function AskBuddyInline({
  speech,
  sourceLabel,
  isLoading,
  expanded,
  onToggle,
  onAsk,
}: {
  speech: string;
  sourceLabel: string;
  isLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAsk: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/30 px-4 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
        >
          <HelpCircle size={14} />
          {expanded ? "Hide Buddy's help" : "Ask Buddy to explain this step"}
        </button>
      </div>
      {expanded ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 font-bold text-sky-100">
              {sourceLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 font-bold text-emerald-100">
              Private ticket details hidden
            </span>
          </div>
          <p
            className="mt-3 break-words text-sm leading-6 text-[var(--muted-strong)]"
            style={textWrapStyle}
          >
            {speech}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAsk}
              disabled={isLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={14} />
              {isLoading ? "Thinking..." : "Ask the AI"}
            </button>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
