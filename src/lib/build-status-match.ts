/**
 * Pure logic for matching a GitHub Actions workflow run to a Buddy ticket.
 *
 * The API route at src/app/api/mvp-ticket-checklist/build-status/route.ts wraps
 * this with the GitHub fetch + caching. Keeping the matcher pure makes it
 * trivial to unit-test without hitting the network.
 */

export type GhRunStatus = "queued" | "in_progress" | "completed" | string;
export type GhRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "skipped"
  | "stale"
  | "startup_failure"
  | null;

/** Subset of fields we read from the GitHub /actions/runs API. */
export type GhWorkflowRun = {
  id: number;
  name?: string | null;
  status: GhRunStatus;
  conclusion: GhRunConclusion;
  html_url: string;
  head_sha: string;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  head_commit?: { message?: string | null } | null;
};

export type BuildMatchType = "ticket" | "preview-branch" | "latest-main" | "none";

export type BuildRunSummary = {
  id: number;
  status: GhRunStatus;
  conclusion: GhRunConclusion;
  name: string;
  htmlUrl: string;
  headSha: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Elapsed seconds. For in_progress: now - created_at.
   * For completed: updated_at - created_at.
   */
  durationSec: number;
};

export type BuildMatch = {
  match: BuildMatchType;
  run: BuildRunSummary | null;
};

/**
 * Test if a commit message contains the issue key in the conventional
 * "(BDEV-X)" form. We require the parens so a stray reference to BDEV-49 in
 * prose doesn't accidentally match a totally different ticket.
 */
function commitMessageMatchesIssue(message: string | null | undefined, issueKey: string): boolean {
  if (!message || !issueKey) return false;
  const needle = `(${issueKey})`;
  return message.includes(needle);
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function durationSecForRun(run: GhWorkflowRun, nowMs: number): number {
  const createdMs = parseTimestamp(run.created_at);
  if (!createdMs) return 0;
  if (run.status === "completed") {
    const updatedMs = parseTimestamp(run.updated_at);
    if (!updatedMs) return 0;
    return Math.max(0, Math.round((updatedMs - createdMs) / 1000));
  }
  // queued or in_progress (or unknown active state)
  return Math.max(0, Math.round((nowMs - createdMs) / 1000));
}

function summarise(run: GhWorkflowRun, nowMs: number): BuildRunSummary {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    name: run.name ?? "",
    htmlUrl: run.html_url,
    headSha: run.head_sha,
    headBranch: run.head_branch ?? "",
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    durationSec: durationSecForRun(run, nowMs),
  };
}

/**
 * Pick the best workflow run for the given Buddy ticket, in priority order:
 *
 *   1. "ticket"          — head_branch === "main" AND commit message contains
 *                          "(BDEV-X)". Pick the newest among matches.
 *   2. "preview-branch"  — head_branch contains "BDEV-X" (preview/dispatch).
 *                          Pick the newest among matches.
 *   3. "latest-main"     — most-recent run on main, regardless of commit msg.
 *   4. "none"            — empty list / no candidate.
 *
 * Tie-breaker for newest is `created_at` — the workflow run started, not when
 * the underlying commit was authored. This is what the user sees on the
 * Actions page and what the GitHub UI orders by.
 */
export function pickBestRun(
  runs: ReadonlyArray<GhWorkflowRun>,
  issueKey: string,
  nowMs: number = Date.now(),
): BuildMatch {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { match: "none", run: null };
  }

  const sortedNewestFirst = [...runs].sort(
    (a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at),
  );

  // Priority 1: main + commit message references the ticket.
  const ticketMatches = sortedNewestFirst.filter(
    (r) =>
      r.head_branch === "main" &&
      commitMessageMatchesIssue(r.head_commit?.message, issueKey),
  );
  if (ticketMatches.length > 0) {
    return { match: "ticket", run: summarise(ticketMatches[0], nowMs) };
  }

  // Priority 2: preview/dispatch run on a branch named for the ticket.
  // Skip "main" — that was covered above and shouldn't fall through here.
  const previewMatches = sortedNewestFirst.filter(
    (r) =>
      r.head_branch !== null &&
      r.head_branch !== "main" &&
      typeof r.head_branch === "string" &&
      r.head_branch.includes(issueKey),
  );
  if (previewMatches.length > 0) {
    return { match: "preview-branch", run: summarise(previewMatches[0], nowMs) };
  }

  // Priority 3: most recent run on main, even if no ticket match.
  const mainRun = sortedNewestFirst.find((r) => r.head_branch === "main");
  if (mainRun) {
    return { match: "latest-main", run: summarise(mainRun, nowMs) };
  }

  return { match: "none", run: null };
}
