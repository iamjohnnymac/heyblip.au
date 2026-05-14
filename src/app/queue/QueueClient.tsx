"use client";

// Client driver for /queue. Fetches the full ranked list once on mount,
// polls every 30s (mirrored from MvpTicketChecklistClient), and renders:
//
//   1. Header — Buddy logo + total / ready summary + refresh
//   2. "Buddy suggests next" — the highest-ranked Ready ticket (if any)
//   3. Filter chip row with counts; single-select, "All" default
//   4. Three vertical groups (Ready / In progress / Waiting to start)
//
// Boundary: this file is the only client owner of /queue. It must not
// import from MvpTicketChecklistClient or any /mvp-ticket-checklist/*
// component — the existing checklist client is being rebuilt in a
// separate worktree.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import QueueCard from "./QueueCard";

// Shape of one row coming back from /api/mvp-ticket-checklist/queue. The
// API strips `score` from the public payload; everything else on QueueRow
// is preserved.
export type QueueRowView = {
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
  labels: string[];
  hasAgentTestUpdate: boolean;
  hasHumanTestResult: boolean;
  agentTestUpdateStatus: "passed" | "failed" | "inconclusive" | "unknown";
  reasons: string[];
  ageInStatusHours: number;
  hasBuild: boolean;
  hasHumanReady: boolean;
  surfaceList: string[];
  presence: { sessionId: string; ageMinutes: number } | null;
  // Coarse work-area bucket — drives the area filter chip row. See
  // classifyWorkArea() in src/lib/ticket-queue.ts for the mapping.
  area: "ios" | "backend" | "web" | "launch" | "other";
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rows: QueueRowView[] }
  | { status: "error"; message: string };

type FilterKey =
  | "all"
  | "ready"
  | "backlog"
  | "launch-blockers"
  | "high-priority";

// Area filter — orthogonal to FilterKey. Both filters compose (a row
// must match BOTH the status filter and the area filter to show up).
type AreaKey = "all" | "ios" | "backend" | "web" | "launch" | "other";

const AREA_LABELS: Record<AreaKey, string> = {
  all: "All areas",
  ios: "iOS app",
  backend: "Backend",
  web: "Marketing site",
  launch: "Launch",
  other: "Other",
};

function isAreaKey(value: string | null): value is AreaKey {
  return value === "all" || value === "ios" || value === "backend" || value === "web" || value === "launch" || value === "other";
}

function matchesArea(row: QueueRowView, area: AreaKey): boolean {
  if (area === "all") return true;
  return row.area === area;
}

// ── Grouping helpers ─────────────────────────────────────────────────
//
// Plain-English buckets that mirror the mockup. Priority is intentional:
// "Ready for you" wins ties — a "Verifying" ticket also marked
// `humanFinalReview=Ready` shouldn't show up under "In progress".

function isReady(row: QueueRowView): boolean {
  const status = row.status.toLowerCase();
  const review = row.humanFinalReview.toLowerCase();
  const stage = row.loopStage.toLowerCase();
  // Hard bail: if the human has already verified this and the verdict
  // was fail/inconclusive (recorded as HFR = Failed by the findings
  // route), the ticket is NOT Ready any more even when status is still
  // Verifying. The user can still tap Mark Done as an override; but
  // until they do, the bucket reflects the failed verification.
  if (review === "failed") return false;
  if (status === "verifying") return true;
  if (review === "ready") return true;
  if (/verifying|in build|ci green/i.test(stage)) return true;
  // Fallback: an In Progress ticket whose AI summary says "passed" is
  // ready to test even if its Jira status didn't auto-transition. Catches
  // the BDEV-493-style drift where the merge-to-Verifying automation
  // didn't fire (engineer skipped To Do → In Progress, or the PR title
  // didn't match the rule).
  if (status === "in progress" && row.agentTestUpdateStatus === "passed") return true;
  return false;
}

function isInProgress(row: QueueRowView): boolean {
  if (isReady(row)) return false;
  const status = row.status.toLowerCase();
  const review = row.humanFinalReview.toLowerCase();
  // Catches the "verified but failed" state: status stayed Verifying
  // because the user hasn't tapped Reopen yet, but HFR=Failed already
  // dropped them out of Ready above. Without this branch they'd
  // disappear from every bucket.
  return status === "in progress" || (status === "verifying" && review === "failed");
}

function isWaiting(row: QueueRowView): boolean {
  if (isReady(row) || isInProgress(row)) return false;
  const status = row.status.toLowerCase();
  const stage = row.loopStage.toLowerCase();
  return status === "selected" || stage === "selected";
}

// "Not yet picked up" — vanilla To Do tickets that no AI has started on
// yet. Anything in another bucket (ready / in-progress / waiting) wins
// first so the same ticket doesn't render twice.
function isBacklog(row: QueueRowView): boolean {
  if (isReady(row) || isInProgress(row) || isWaiting(row)) return false;
  const status = row.status.toLowerCase();
  return status === "to do" || status === "todo" || status === "open" || status === "backlog";
}

function matchesFilter(row: QueueRowView, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return isReady(row);
    case "backlog":
      return isBacklog(row);
    case "launch-blockers":
      return row.labels.some((label) => label.toLowerCase() === "launch-blocker");
    case "high-priority": {
      const p = row.priority.toLowerCase();
      return p === "highest" || p === "high";
    }
    default:
      return true;
  }
}

// ── Component ────────────────────────────────────────────────────────

export default function QueueClient({ accessParam }: { accessParam: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [filter, setFilter] = useState<FilterKey>("all");
  // Initialise area from `?area=` so a teammate can be sent a pre-scoped
  // URL. Falls back to "all" when the param is missing or unrecognised.
  const initialArea = searchParams.get("area");
  const [areaFilter, setAreaFilter] = useState<AreaKey>(
    isAreaKey(initialArea) ? initialArea : "all",
  );
  const [isRefreshing, startRefresh] = useTransition();
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Sync the area filter back to the URL so the page is shareable. Use
  // router.replace (not push) so the back button isn't littered with
  // every chip tap.
  const updateAreaFilter = useCallback(
    (next: AreaKey) => {
      setAreaFilter(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") {
        params.delete("area");
      } else {
        params.set("area", next);
      }
      const qs = params.toString();
      router.replace(qs ? `/queue?${qs}` : "/queue");
    },
    [router, searchParams],
  );

  const buildUrl = useCallback(() => {
    const qs = new URLSearchParams({ limit: "all" });
    if (accessParam) qs.set("access", accessParam);
    return `/api/mvp-ticket-checklist/queue?${qs.toString()}`;
  }, [accessParam]);

  const load = useCallback(
    async (mode: "initial" | "poll") => {
      if (mode === "initial") setState({ status: "loading" });
      try {
        const response = await fetch(buildUrl(), { cache: "no-store" });
        const body = await response.json();
        if (body.status !== "ready") {
          setState({ status: "error", message: body.message || "Queue could not load." });
          return;
        }
        const rows = Array.isArray(body.rows) ? (body.rows as QueueRowView[]) : [];
        setState({ status: "ready", rows });
        setLastFetchedAt(Date.now());
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Queue request failed.",
        });
      }
    },
    [buildUrl],
  );

  // Initial fetch. `load("initial")` synchronously sets state to "loading"
  // before awaiting, so React lint flags it as a setState-in-effect. Defer
  // to a microtask so the first render commits as { status: "idle" } and
  // the effect cleanly transitions afterwards.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load("initial");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // 1s wall-clock tick so the "Updated Xs ago" label in the header rolls
  // forward smoothly. Stays separate from the 30s data poll so the timer
  // visibly counts up between fetches.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 30s polling — mirrors MvpTicketChecklistClient. Skip polling when the
  // tab is hidden so we don't quietly hammer Jira when nobody's looking.
  useEffect(() => {
    let lastChecked = Date.now();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      lastChecked = Date.now();
      void load("poll");
    };
    const onVisibility = () => {
      if (typeof document === "undefined" || document.hidden) return;
      if (Date.now() - lastChecked > 15_000) tick();
    };
    const interval = setInterval(tick, 30_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [load]);

  // Hoisting `rows` through useMemo keeps its identity stable across
  // renders when the underlying state hasn't changed — without this the
  // downstream useMemo hooks see "rows" as a fresh array every render and
  // never benefit from memoisation.
  const rows = useMemo<QueueRowView[]>(
    () => (state.status === "ready" ? state.rows : []),
    [state],
  );

  // Derive counts off the full row set so filter chips show truth, not
  // "what's currently visible". Area counts respect the current status
  // filter (so "iOS 14" reflects "Ready iOS tickets" when Ready is
  // active) — that's more useful than a static area total.
  const counts = useMemo(() => {
    const result = {
      all: rows.length,
      ready: 0,
      backlog: 0,
      "launch-blockers": 0,
      "high-priority": 0,
    } as Record<FilterKey, number>;
    for (const row of rows) {
      if (isReady(row)) result.ready += 1;
      if (isBacklog(row)) result.backlog += 1;
      if (row.labels.some((label) => label.toLowerCase() === "launch-blocker"))
        result["launch-blockers"] += 1;
      const p = row.priority.toLowerCase();
      if (p === "highest" || p === "high") result["high-priority"] += 1;
    }
    return result;
  }, [rows]);

  // Area chip counts — computed against the rows that already match the
  // status filter so the badges reflect "X iOS tickets that are also
  // Ready" rather than "X iOS tickets in the whole queue".
  const areaCounts = useMemo(() => {
    const result: Record<AreaKey, number> = {
      all: 0,
      ios: 0,
      backend: 0,
      web: 0,
      launch: 0,
      other: 0,
    };
    for (const row of rows) {
      if (!matchesFilter(row, filter)) continue;
      result.all += 1;
      result[row.area] = (result[row.area] || 0) + 1;
    }
    return result;
  }, [rows, filter]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter) && matchesArea(row, areaFilter)),
    [rows, filter, areaFilter],
  );

  const readyRows = useMemo(() => filteredRows.filter(isReady), [filteredRows]);
  const inProgressRows = useMemo(() => filteredRows.filter(isInProgress), [filteredRows]);
  const waitingRows = useMemo(() => filteredRows.filter(isWaiting), [filteredRows]);
  const backlogRows = useMemo(() => filteredRows.filter(isBacklog), [filteredRows]);

  // Top pick respects BOTH filters so the "Buddy suggests next" banner
  // points at something inside the active scope (e.g. the highest-rank
  // Ready iOS ticket when the URL is `?area=ios`).
  const topPick = rows.find((row) => isReady(row) && matchesArea(row, areaFilter));

  function handleRefresh() {
    startRefresh(() => {
      router.refresh();
      void load("poll");
    });
  }

  return (
    // min-w-0 + w-full belt-and-braces: body is `flex flex-col` so
    // main is a flex item, and flex items default to `min-width: auto`
    // which prevents them from shrinking below their content's min-
    // content width. On a narrow phone that meant the chip row's
    // intrinsic min width was making MAIN itself 80px wider than the
    // viewport — overflow-x-hidden on its children wasn't enough.
    // overflow-x-hidden then keeps any future accidental wide content
    // from re-opening a horizontal page scroll.
    <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-5 py-8 sm:px-8 sm:py-10">
      <Header
        total={rows.length}
        readyCount={counts.ready}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        freshnessLabel={freshnessLabel(lastFetchedAt, now)}
      />

      {state.status === "loading" ? <LoadingSkeleton /> : null}

      {state.status === "error" ? (
        <ErrorBanner message={state.message} onRetry={() => void load("initial")} />
      ) : null}

      {state.status === "ready" ? (
        <>
          {topPick ? <TopPickBanner row={topPick} accessParam={accessParam} /> : null}

          <FilterChipRow filter={filter} onChange={setFilter} counts={counts} />
          <AreaChipRow area={areaFilter} onChange={updateAreaFilter} counts={areaCounts} />

          <GroupSection
            title="Ready for you"
            tagline="AI handed these over"
            dotClass="bg-emerald-400"
            rows={readyRows}
            accessParam={accessParam}
            accessParamForGenerate={accessParam}
          />
          <GroupSection
            title="In progress"
            tagline="AI is working on these"
            dotClass="bg-sky-400"
            rows={inProgressRows}
            accessParam={accessParam}
            accessParamForGenerate={accessParam}
          />
          <GroupSection
            title="Waiting to start"
            tagline="AI hasn't picked these up yet"
            dotClass="bg-white/40"
            rows={waitingRows}
            accessParam={accessParam}
            accessParamForGenerate={accessParam}
          />
          {/* New: backlog section. Sits after Waiting because the reading
              order is urgency-descending: ready (test now) → in progress
              (AI working) → waiting (scheduled) → backlog (untouched).
              The muted purple dot signals "purple = AI-aware but not yet
              acted on" without competing with the green Ready dot.   */}
          <GroupSection
            title="Not started"
            tagline="AI hasn't picked these up yet"
            dotClass="bg-[var(--accent)]/60"
            rows={backlogRows}
            accessParam={accessParam}
            accessParamForGenerate={accessParam}
            emptyMessage="No tickets sitting in the backlog right now."
          />

          <p className="mt-10 text-center text-xs text-[var(--muted)]">
            Refreshes every 30 seconds. Cards open the full test checklist.
          </p>
        </>
      ) : null}
    </main>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  total,
  readyCount,
  onRefresh,
  isRefreshing,
  freshnessLabel,
}: {
  total: number;
  readyCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  freshnessLabel: string;
}) {
  return (
    <header className="mb-7 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent)]">
          <span className="text-lg font-extrabold leading-none text-white">B</span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Buddy queue</h1>
          <p className="text-sm text-[var(--muted)]">
            {total} {total === 1 ? "ticket" : "tickets"} across testing
            <span className="mx-1.5">·</span>
            {readyCount} ready for you
            {freshnessLabel ? (
              <>
                <span className="mx-1.5">·</span>
                <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  {freshnessLabel}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="Refresh queue"
        className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-white/[0.03] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
      >
        <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        <span className="hidden sm:inline">{isRefreshing ? "Refreshing…" : "Refresh"}</span>
      </button>
    </header>
  );
}

// Plain-English "Updated Xs ago" label for the queue header. Live ticks so
// the user can see how stale the data is between the 30s polls. Returns ""
// when we haven't fetched yet (don't show a misleading "0s ago").
function freshnessLabel(fetchedAt: number | null, now: number): string {
  if (!fetchedAt) return "";
  const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? "Updated 1m ago" : `Updated ${minutes}m ago`;
}

// ── Top pick banner ──────────────────────────────────────────────────

function TopPickBanner({ row, accessParam }: { row: QueueRowView; accessParam: string }) {
  const href = (
    accessParam
      ? `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}&access=${encodeURIComponent(accessParam)}`
      : `/mvp-ticket-checklist?issue=${encodeURIComponent(row.issueKey)}`
  ) as Route;

  const reasons = row.reasons.slice(0, 4).join(" · ");

  return (
    <section
      className="mb-7 rounded-3xl border p-5 sm:p-6"
      style={{
        background:
          "linear-gradient(135deg, rgba(102,0,255,0.18) 0%, rgba(102,0,255,0.05) 60%, transparent 100%)",
        borderColor: "rgba(102,0,255,0.35)",
      }}
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-[var(--accent-light)]">
            <Sparkles size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Buddy suggests next</span>
          </div>
          <p className="break-words text-lg font-bold leading-snug sm:text-xl">
            <span className="mr-1.5 text-base font-extrabold tracking-wide text-[var(--accent-light)]">
              {row.issueKey}
            </span>
            {row.summary}
          </p>
          {reasons ? (
            <p className="mt-1.5 text-[0.79rem] leading-snug text-[var(--muted)]">{reasons}</p>
          ) : null}
        </div>
        <Link
          href={href}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 font-bold text-white transition-colors hover:bg-[var(--accent-light)]"
        >
          Open {row.issueKey}
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

// ── Filter chips ─────────────────────────────────────────────────────

function FilterChipRow({
  filter,
  onChange,
  counts,
}: {
  filter: FilterKey;
  onChange: (next: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "ready", label: "Ready for you" },
    { key: "backlog", label: "Not started" },
    { key: "launch-blockers", label: "Launch blockers" },
    { key: "high-priority", label: "Top priority" },
  ];
  return (
    <div
      className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      role="group"
      aria-label="Filter tickets by status"
    >
      {chips.map(({ key, label }) => {
        const isActive = filter === key;
        const count = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            // min-h-[44px] keeps chips comfortably tappable on iPhone even
            // though the visual baseline is shorter; matches Apple's HIG.
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold leading-none transition-colors ${
              isActive
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border-strong)] bg-white/[0.03] text-[var(--muted-strong)] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-[0.1rem] text-[0.68rem] font-bold ${
                isActive ? "bg-white/[0.22]" : "bg-white/[0.12]"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Second chip row — area filter. Composes with the status chips above so
// "Ready for you" + "iOS app" shows the ready-to-test iOS tickets only.
// Mirrored styling so the two rows feel like a single filter strip.
function AreaChipRow({
  area,
  onChange,
  counts,
}: {
  area: AreaKey;
  onChange: (next: AreaKey) => void;
  counts: Record<AreaKey, number>;
}) {
  const chips: { key: AreaKey; label: string }[] = [
    { key: "all", label: AREA_LABELS.all },
    { key: "ios", label: AREA_LABELS.ios },
    { key: "backend", label: AREA_LABELS.backend },
    { key: "web", label: AREA_LABELS.web },
    { key: "launch", label: AREA_LABELS.launch },
    { key: "other", label: AREA_LABELS.other },
  ];
  return (
    <div
      className="mb-8 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      role="group"
      aria-label="Filter tickets by work area"
    >
      {chips.map(({ key, label }) => {
        const isActive = area === key;
        const count = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            // Subtle visual distinction from the status chips above: same
            // shape + size, but the active state uses a muted accent so
            // the eye can still read "primary filter = status".
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold leading-none transition-colors ${
              isActive
                ? "border-sky-300/55 bg-sky-300/15 text-sky-100"
                : "border-[var(--border-strong)] bg-white/[0.03] text-[var(--muted-strong)] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-[0.1rem] text-[0.68rem] font-bold ${
                isActive ? "bg-sky-200/25" : "bg-white/[0.12]"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Group section ────────────────────────────────────────────────────

function GroupSection({
  title,
  tagline,
  dotClass,
  rows,
  accessParam,
  accessParamForGenerate,
  emptyMessage,
}: {
  title: string;
  tagline: string;
  dotClass: string;
  rows: QueueRowView[];
  accessParam: string;
  // Pass-through used by the per-card Generate AI Summary action — kept
  // separate from accessParam in case we ever want a finer-grained gate.
  accessParamForGenerate: string;
  emptyMessage?: string;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <h2 className="text-[1.05rem] font-bold tracking-tight">{title}</h2>
        <span className="text-sm font-medium text-[var(--muted)]">
          {rows.length} {rows.length === 1 ? "ticket" : "tickets"} · {tagline}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white/[0.015] px-4 py-6 text-center text-sm text-[var(--muted)]">
          {emptyMessage || "No tickets in this group right now."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <QueueCard
              key={row.issueKey}
              row={row}
              accessParam={accessParam}
              accessParamForGenerate={accessParamForGenerate}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Loading / error states ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid animate-pulse gap-4">
      <div className="h-24 rounded-3xl bg-white/[0.04]" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-white/[0.04]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[168px] rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-7 flex flex-col items-start gap-3 rounded-2xl border border-rose-300/35 bg-rose-300/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-bold text-rose-100">Queue could not load.</p>
        <p className="mt-0.5 text-[0.78rem] text-rose-200/70">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-300/15"
      >
        Try again
      </button>
    </div>
  );
}
