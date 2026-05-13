"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

// The lean breadcrumb that replaces the old BuddySuggestionStrip. It tells
// John where he is in the queue ("3 of 7 ready") and what comes next
// (a link to the next ready ticket). It's deliberately tiny — one tap back
// to /queue, one tap to the next ticket. No dropdown clutter.
//
// Fetches the queue with ?limit=all so we can compute position correctly.
// The companion `/queue` build adds three fields to each row (`labels`,
// `hasAgentTestUpdate`, `hasHumanTestResult`). Before that merge those
// fields may be absent — we treat them as optional and don't depend on them.
//
// Returns null while loading (the breadcrumb is so small a skeleton would
// be more disruptive than its absence) and on error.

type QueueRow = {
  issueKey: string;
  summary?: string;
  status?: string;
  // Optional new fields — added by the parallel /queue worktree. Absent
  // pre-merge; we handle that gracefully.
  hasAgentTestUpdate?: boolean;
  hasHumanTestResult?: boolean;
  labels?: string[];
};

type QueueResponse =
  | { status: "ready"; rows?: QueueRow[]; total?: number }
  | { status: "error"; message?: string };

export function QueueBreadcrumb({
  accessParam,
  currentIssueKey,
}: {
  accessParam: string;
  currentIssueKey: string;
}) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        if (accessParam) params.set("access", accessParam);
        params.set("limit", "all");
        const response = await fetch(`/api/mvp-ticket-checklist/queue?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as QueueResponse;
        if (cancelled) return;
        if (body.status !== "ready") return;
        setRows(Array.isArray(body.rows) ? body.rows : []);
        setTotal(typeof body.total === "number" ? body.total : 0);
      } catch {
        // Silent — breadcrumb is decorative.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessParam, currentIssueKey]);

  const queueHref = accessParam
    ? `/queue?access=${encodeURIComponent(accessParam)}`
    : "/queue";

  if (!rows) {
    // Loading — show just the back link so the page still has a way home.
    return (
      <nav className="mb-5 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <Link
          href={queueHref}
          className="inline-flex min-h-9 items-center gap-1.5 transition-colors hover:text-white"
        >
          <ChevronLeft size={14} strokeWidth={2.2} />
          Queue
        </Link>
      </nav>
    );
  }

  const position = rows.findIndex((row) => row.issueKey === currentIssueKey);
  const readyCount = rows.length;
  const totalCount = total || readyCount;
  const next = position >= 0 && position + 1 < rows.length ? rows[position + 1] : rows[0];
  const nextIsSelf = next?.issueKey === currentIssueKey;
  const showNext = next && !nextIsSelf;

  const positionLabel =
    position >= 0
      ? `${position + 1} of ${totalCount} ready`
      : readyCount
        ? `${readyCount} ready`
        : "Queue empty";

  const nextHref = next
    ? accessParam
      ? `/mvp-ticket-checklist?issue=${encodeURIComponent(next.issueKey)}&access=${encodeURIComponent(
          accessParam,
        )}`
      : `/mvp-ticket-checklist?issue=${encodeURIComponent(next.issueKey)}`
    : null;

  return (
    <nav className="mb-5 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
      <Link
        href={queueHref}
        className="inline-flex min-h-9 items-center gap-1.5 transition-colors hover:text-white"
      >
        <ChevronLeft size={14} strokeWidth={2.2} />
        Queue
      </Link>
      <span className="truncate text-right">
        {positionLabel}
        {showNext && nextHref ? (
          <>
            <span className="mx-1.5">·</span>
            <Link
              href={nextHref}
              className="font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
            >
              {next.issueKey} next
            </Link>
          </>
        ) : null}
      </span>
    </nav>
  );
}
