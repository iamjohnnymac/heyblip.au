import { NextResponse } from "next/server";
import { jiraFetch, readJiraConfig } from "@/lib/mvp-ticket-checklist";
import {
  QUEUE_FIELDS,
  buildQueueJql,
  normaliseCandidate,
  rankCandidates,
  type RawJiraCandidate,
  type QueueRow,
} from "@/lib/ticket-queue";
import { getPresenceMany } from "@/lib/buddy-presence";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const QUEUE_LIMIT = 50;
const TOP_N = 10;
const RECENT_PRESENCE_WINDOW_MS = 10 * 60 * 1000;

type QueueResponse =
  | { status: "ready"; rows: PublicQueueRow[]; total: number; presenceEnabled: boolean }
  | { status: "error"; message: string; missingEnv?: string[] };

type PublicQueueRow = Omit<QueueRow, "score"> & {
  presence: { sessionId: string; ageMinutes: number } | null;
};

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access?: string | null): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

export async function GET(request: Request): Promise<NextResponse<QueueResponse>> {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");

  if (!isAccessAllowed(access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const config = readJiraConfig();
  if ("missingEnv" in config) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured.", missingEnv: config.missingEnv },
      { status: 503 },
    );
  }

  const jql = encodeURIComponent(buildQueueJql());
  const fields = QUEUE_FIELDS.join(",");
  const path = `/rest/api/3/search/jql?jql=${jql}&fields=${encodeURIComponent(fields)}&maxResults=${QUEUE_LIMIT}`;

  let raw: { issues?: RawJiraCandidate[] };
  try {
    raw = await jiraFetch<{ issues?: RawJiraCandidate[] }>(config, path);
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Jira search failed." },
      { status: 502 },
    );
  }

  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const candidates = issues
    .map((issue) => normaliseCandidate(issue))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const ranked = rankCandidates({ candidates });
  const top = ranked.slice(0, TOP_N);

  const presenceMap = await getPresenceMany(top.map((row) => row.issueKey));
  const presenceEnabled = Object.values(presenceMap).some((v) => v !== null) || Boolean(process.env.KV_REST_API_URL);
  const now = Date.now();

  const publicRows: PublicQueueRow[] = top.map(({ score, ...row }) => {
    void score;
    const presence = presenceMap[row.issueKey];
    if (!presence || now - presence.at > RECENT_PRESENCE_WINDOW_MS) {
      return { ...row, presence: null };
    }
    return {
      ...row,
      presence: {
        sessionId: presence.sessionId,
        ageMinutes: Math.max(0, Math.round((now - presence.at) / (60 * 1000))),
      },
    };
  });

  return NextResponse.json({
    status: "ready",
    rows: publicRows,
    total: ranked.length,
    presenceEnabled,
  });
}
