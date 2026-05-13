"use client";

// Single card in the /queue overview. One ticket = one card. The whole
// card surface is a tappable link to the detail page, BUT the AI summary
// pill is a real <button> (interactive — fires the Generate API). To
// avoid nesting a <button> inside an <a> (invalid HTML, breaks hydration
// in React 19), the outer container is an <article> with an
// absolute-positioned Link covering the click area as a sibling of the
// interactive controls. The button sits above the link via z-index so
// taps on the pill don't navigate.
//
// Visual target: design/queue-mockup.html (.card / .pill rules). Plain
// English language only — no "agent", "STOP", or "Verified Build/Commit"
// language reaches the user here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Check, Loader2, Sparkles } from "lucide-react";
import { shortenShas } from "@/lib/ticket-queue";
import type { QueueRowView } from "./QueueClient";

type Props = {
  row: QueueRowView;
  accessParam: string;
  // Pass-through used by the per-card Generate AI Summary action. Same
  // value as accessParam in practice; kept as a separate prop so the
  // caller can swap in a tighter gate without touching every link href.
  accessParamForGenerate: string;
};

function priorityPillClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "highest") {
    return "border-rose-300/35 bg-rose-300/8 text-rose-200";
  }
  if (p === "high") {
    return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  }
  if (p === "low" || p === "lowest") {
    return "border-white/10 bg-white/[0.02] text-[var(--muted-strong)]";
  }
  return "border-white/15 bg-white/[0.03] text-[var(--muted-strong)]";
}

function ageColorClass(hours: number): string {
  if (hours >= 24 * 7) return "text-red-300";
  if (hours >= 24) return "text-orange-300";
  return "text-[var(--muted)]";
}

function formatAge(hours: number, status: string): string {
  if (!hours || hours < 1) return `<1h in ${status}`;
  if (hours < 24) return `${Math.round(hours)}h in ${status}`;
  const days = Math.round(hours / 24);
  return `${days}d in ${status}`;
}

type GenerateState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function QueueCard({ row, accessParam, accessParamForGenerate }: Props) {
  const router = useRouter();
  const href = (
    accessParam
      ? `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}&access=${encodeURIComponent(accessParam)}`
      : `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}`
  ) as Route;

  const isLaunchBlocker = row.labels.some((label) => label.toLowerCase() === "launch-blocker");
  const blocksCount = row.blocksKeys.length;

  const [generateState, setGenerateState] = useState<GenerateState>({ kind: "idle" });

  async function handleGenerate() {
    setGenerateState({ kind: "submitting" });
    try {
      const response = await fetch("/api/mvp-ticket-checklist/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: row.issueKey,
          access: accessParamForGenerate,
        }),
      });
      const body = (await response.json()) as
        | { status: "ready"; commentId: string }
        | { status: "exists"; message: string }
        | { status: "error"; message: string };

      if (response.status === 409 && body.status === "exists") {
        // Already posted (e.g. another tab raced us) — treat as success
        // and let the queue re-fetch reveal the new "AI summary" pill.
        setGenerateState({ kind: "done" });
        router.refresh();
        return;
      }

      if (!response.ok || body.status !== "ready") {
        const message =
          "message" in body && body.message ? body.message : "Buddy couldn't generate this.";
        setGenerateState({ kind: "error", message });
        return;
      }

      setGenerateState({ kind: "done" });
      router.refresh();
    } catch {
      setGenerateState({ kind: "error", message: "Buddy couldn't reach the server." });
    }
  }

  const generateBusy =
    generateState.kind === "submitting" || generateState.kind === "done";

  return (
    <article className="group relative flex min-h-[168px] flex-col gap-2.5 rounded-2xl border border-[var(--border)] bg-white/[0.03] p-[1.05rem] transition-all duration-150 hover:-translate-y-px hover:border-[var(--accent)]/45 hover:bg-white/[0.055] hover:shadow-[0_12px_36px_rgba(102,0,255,0.18)] focus-within:-translate-y-px focus-within:border-[var(--accent)]/45 focus-within:bg-white/[0.055]">
      {/* The whole card is a link — absolute so it doesn't enclose the
          interactive Generate button (invalid <button> inside <a>). The
          button below sits on z-10, above this. */}
      <Link
        href={href}
        aria-label={`Open ${row.issueKey}: ${row.summary}`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
      />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-[0.78rem] font-extrabold tracking-wide text-[var(--accent-light)]">
          {row.issueKey}
        </span>
        <span className={`text-[0.78rem] ${ageColorClass(row.ageInStatusHours)}`}>
          {formatAge(row.ageInStatusHours, row.status)}
        </span>
      </div>

      <p className="relative z-10 line-clamp-2 text-[0.95rem] font-semibold leading-snug text-white">
        {row.summary}
      </p>

      <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
        {row.priority ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none ${priorityPillClass(row.priority)}`}
          >
            {row.priority}
          </span>
        ) : null}
        {row.mvpTrack ? (
          <span className="inline-flex items-center rounded-full border border-[var(--border-strong)] bg-white/[0.03] px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-[var(--muted-strong)]">
            {row.mvpTrack}
          </span>
        ) : null}
        {isLaunchBlocker ? (
          <span className="inline-flex items-center rounded-full border border-[var(--accent)]/55 bg-[var(--accent)]/[0.18] px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-white">
            Launch blocker
          </span>
        ) : null}
        {row.hasAgentTestUpdate && row.hasBuild && row.verifiedBuildOrCommit ? (
          // Summary + build = AI has shipped real code; this is something
          // you can actually pick up your phone and verify. Green is the
          // "go test" signal across the dashboard.
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/45 bg-emerald-300/10 px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-emerald-100">
            <Check size={11} strokeWidth={3} />
            Fix in build {shortenShas(row.verifiedBuildOrCommit)}
          </span>
        ) : row.hasAgentTestUpdate ? (
          // Summary but no build = AI's only written a plan (either
          // Generate-AI-Summary was tapped, or the agent commented without
          // shipping yet). Amber is the "wait, no real code yet" signal.
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-amber-100">
            <Sparkles size={11} strokeWidth={3} />
            Plan only
          </span>
        ) : (
          // No AI summary yet → swap the muted "No AI summary" pill for a
          // tappable Generate pill. Tap fires the same POST as the detail
          // page button. min-h-9 keeps it 44pt-friendly for iOS taps.
          <button
            type="button"
            onClick={() => {
              if (generateBusy) return;
              void handleGenerate();
            }}
            disabled={generateBusy}
            aria-busy={generateState.kind === "submitting"}
            title={
              generateState.kind === "error"
                ? `Generate failed: ${generateState.message}. Tap to retry.`
                : "Ask the AI to write a test summary for this ticket."
            }
            className={`relative inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-[0.18rem] text-[0.66rem] font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              generateState.kind === "done"
                ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                : generateState.kind === "error"
                  ? "border-red-300/45 bg-red-300/10 text-red-100 hover:bg-red-300/15"
                  : "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-light)] hover:bg-[var(--accent)]/20"
            }`}
          >
            {generateState.kind === "submitting" ? (
              <>
                <Loader2 size={11} className="animate-spin" strokeWidth={3} />
                Generating
              </>
            ) : generateState.kind === "done" ? (
              <>
                <Sparkles size={11} strokeWidth={3} />
                Summary posted
              </>
            ) : generateState.kind === "error" ? (
              <>
                <Sparkles size={11} strokeWidth={3} />
                Retry generate
              </>
            ) : (
              <>
                <Sparkles size={11} strokeWidth={3} />
                Generate
              </>
            )}
          </button>
        )}
        {row.hasBuild && row.verifiedBuildOrCommit && !row.hasAgentTestUpdate ? (
          // Edge case: a build exists but no AI summary has been posted
          // yet. Keep a separate build pill so the SHA still shows. When a
          // summary exists, the "Fix in build X" pill above carries it.
          <span className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-300/10 px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-sky-100">
            build {shortenShas(row.verifiedBuildOrCommit)}
          </span>
        ) : null}
        {blocksCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-amber-300/35 bg-amber-300/[0.06] px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-amber-100">
            Blocks {blocksCount}
          </span>
        ) : null}
      </div>
    </article>
  );
}
