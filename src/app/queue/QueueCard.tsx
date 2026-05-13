"use client";

// Single card in the /queue overview. One ticket = one card. Whole card is
// a link to the existing checklist page; the page itself doesn't fetch
// anything — all data is passed in.
//
// Visual target: design/queue-mockup.html (.card / .pill rules). Plain
// English language only — no "agent", "STOP", or "Verified Build/Commit"
// language reaches the user here.

import Link from "next/link";
import type { Route } from "next";
import type { QueueRowView } from "./QueueClient";

type Props = {
  row: QueueRowView;
  accessParam: string;
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

export default function QueueCard({ row, accessParam }: Props) {
  const href = (
    accessParam
      ? `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}&access=${encodeURIComponent(accessParam)}`
      : `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}`
  ) as Route;

  const isLaunchBlocker = row.labels.some((label) => label.toLowerCase() === "launch-blocker");
  const blocksCount = row.blocksKeys.length;

  return (
    <Link
      href={href}
      className="group relative flex min-h-[168px] flex-col gap-2.5 rounded-2xl border border-[var(--border)] bg-white/[0.03] p-[1.05rem] transition-all duration-150 hover:-translate-y-px hover:border-[var(--accent)]/45 hover:bg-white/[0.055] hover:shadow-[0_12px_36px_rgba(102,0,255,0.18)] focus-visible:-translate-y-px focus-visible:border-[var(--accent)]/45 focus-visible:bg-white/[0.055]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.78rem] font-extrabold tracking-wide text-[var(--accent-light)]">
          {row.issueKey}
        </span>
        <span className={`text-[0.78rem] ${ageColorClass(row.ageInStatusHours)}`}>
          {formatAge(row.ageInStatusHours, row.status)}
        </span>
      </div>

      <p className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-white">
        {row.summary}
      </p>

      <div className="mt-auto flex flex-wrap gap-1.5">
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
        {row.hasAgentTestUpdate ? (
          <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-emerald-100">
            AI summary
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-white/[0.02] px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-[var(--muted)]">
            No AI summary yet
          </span>
        )}
        {row.hasBuild && row.verifiedBuildOrCommit ? (
          <span className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-300/10 px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-sky-100">
            build {row.verifiedBuildOrCommit}
          </span>
        ) : null}
        {blocksCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-amber-300/35 bg-amber-300/[0.06] px-2 py-[0.18rem] text-[0.66rem] font-bold leading-none text-amber-100">
            Blocks {blocksCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
