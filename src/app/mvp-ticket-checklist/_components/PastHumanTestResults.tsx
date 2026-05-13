"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, HelpCircle, ListChecks, ThumbsDown, ThumbsUp } from "lucide-react";
import type { HumanTestResultViewModel } from "@/lib/mvp-ticket-checklist";
import { plainRelativeTime, truncate } from "./shared";

// Renders the latest "Human Test Result" comment (if any) so the
// person testing now sees what previous testers (or they themselves)
// already wrote — no Jira hop required.
export function PastHumanTestResultsPanel({ results }: { results: HumanTestResultViewModel[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!results.length) return null;

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
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
              className={`rounded-xl ${tone.bg} p-3 text-sm leading-6`}
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
