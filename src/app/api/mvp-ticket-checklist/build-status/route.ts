import { NextResponse } from "next/server";
import { normalizeIssueKey } from "@/lib/mvp-ticket-checklist";
import {
  pickBestRun,
  type BuildMatch,
  type BuildRunSummary,
  type GhWorkflowRun,
} from "@/lib/build-status-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const GITHUB_OWNER = "iamjohnnymac";
const GITHUB_REPO = "heyblip";
const GITHUB_WORKFLOW = "deploy-testflight.yml";
const GITHUB_API = "https://api.github.com";
const RUNS_PER_PAGE = 20;
const CACHE_TTL_MS = 20_000;

type BuildStatusResponse =
  | {
      status: "ready";
      match: BuildMatch["match"];
      run: BuildRunSummary | null;
    }
  | {
      status: "missing-config";
      match: "none";
      run: null;
    }
  | {
      status: "error";
      match: "none";
      run: null;
      message: string;
    };

type CacheEntry = {
  expiresAt: number;
  body: BuildStatusResponse;
};

// Best-effort in-memory cache. Survives within a single warm Lambda but not
// across cold starts — that's a deliberate v1 trade-off (no KV, no DB).
const responseCache = new Map<string, CacheEntry>();

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access: string | null): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

async function fetchWorkflowRuns(token: string): Promise<GhWorkflowRun[]> {
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=${RUNS_PER_PAGE}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    throw new Error(`GitHub Actions API returned ${status || "an error"}.`);
  }

  const body = (await response.json()) as { workflow_runs?: unknown };
  const runs = Array.isArray(body.workflow_runs) ? body.workflow_runs : [];

  // Defensive shape coercion: pick out the fields we actually use, leave
  // anything else off so accidental contamination from the API never trips
  // the matcher.
  return runs
    .map((raw): GhWorkflowRun | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const id = typeof r.id === "number" ? r.id : null;
      if (id === null) return null;
      const headCommitRaw = r.head_commit;
      const headCommit =
        headCommitRaw && typeof headCommitRaw === "object"
          ? { message: stringOrNull((headCommitRaw as Record<string, unknown>).message) }
          : null;

      return {
        id,
        name: stringOrNull(r.name),
        status: typeof r.status === "string" ? r.status : "unknown",
        conclusion: (typeof r.conclusion === "string" ? r.conclusion : null) as GhWorkflowRun["conclusion"],
        html_url: typeof r.html_url === "string" ? r.html_url : "",
        head_sha: typeof r.head_sha === "string" ? r.head_sha : "",
        head_branch: stringOrNull(r.head_branch),
        created_at: typeof r.created_at === "string" ? r.created_at : "",
        updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
        head_commit: headCommit,
      };
    })
    .filter((r): r is GhWorkflowRun => r !== null);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function GET(request: Request): Promise<NextResponse<BuildStatusResponse>> {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");

  if (!isAccessAllowed(access)) {
    return NextResponse.json(
      { status: "error", match: "none", run: null, message: "Access key required." },
      { status: 401 },
    );
  }

  const issueRaw = url.searchParams.get("issue");
  const issueKey = normalizeIssueKey(issueRaw || "");
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", match: "none", run: null, message: "Missing or invalid issue key." },
      { status: 400 },
    );
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Graceful degrade — UI hides the chip silently rather than surfacing a
    // "GitHub Actions" string the user doesn't care about.
    return NextResponse.json({ status: "missing-config", match: "none", run: null });
  }

  const now = Date.now();
  const cacheKey = issueKey;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.body);
  }

  let runs: GhWorkflowRun[];
  try {
    runs = await fetchWorkflowRuns(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Build status lookup failed.";
    // Don't cache errors — let the next poll retry.
    return NextResponse.json(
      { status: "error", match: "none", run: null, message },
      { status: 502 },
    );
  }

  const match = pickBestRun(runs, issueKey, now);
  const body: BuildStatusResponse = {
    status: "ready",
    match: match.match,
    run: match.run,
  };

  responseCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, body });
  return NextResponse.json(body);
}
