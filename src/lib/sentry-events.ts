// Server-side Sentry org/issue fetch. Used by:
//   - /api/mvp-ticket-checklist/sentry-events  (detail-page live panel)
//   - /api/mvp-ticket-checklist/findings       (Sonnet grading evidence)
//
// Both surfaces share the same caps + timeouts so behaviour is consistent.
// Configure via Vercel env vars:
//   SENTRY_AUTH_TOKEN     - internal token with event:read + issue:read
//   SENTRY_ORG_SLUG       - e.g. heyblip
//   SENTRY_PROJECT_SLUG   - optional default; e.g. apple-ios
//   SENTRY_API_BASE       - optional override; defaults to https://us.sentry.io/api/0
//
// Failure modes (missing env, network error, 404) return empty results
// rather than throwing — Sentry data is supplemental and shouldn't block
// the findings verdict if the integration is offline.

const SENTRY_ISSUE_TIMEOUT_MS = 6000;
export const MAX_SENTRY_IDS_PER_CALL = 12;

export type SentryIssueSnapshot = {
  shortId: string;
  title: string;
  status: string;
  level: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  // Compact one-liner safe to splice into Sonnet evidence.
  evidenceLine: string;
};

export type SentryFetchResult =
  | { status: "ready"; org: string; issues: SentryIssueSnapshot[]; misses: string[] }
  | { status: "disabled"; message: string };

export function readSentryConfig():
  | { token: string; org: string; project: string; base: string }
  | { missing: string[] } {
  const env = {
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG_SLUG: process.env.SENTRY_ORG_SLUG,
  };
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) return { missing };
  return {
    token: env.SENTRY_AUTH_TOKEN as string,
    org: env.SENTRY_ORG_SLUG as string,
    project: process.env.SENTRY_PROJECT_SLUG || "apple-ios",
    base: process.env.SENTRY_API_BASE || "https://us.sentry.io/api/0",
  };
}

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function fetchSentryIssueSnapshots(
  rawIds: string[],
): Promise<SentryFetchResult> {
  const ids = Array.from(
    new Set(
      rawIds
        .map((id) => (id || "").trim().toUpperCase())
        .filter((id) => /^[A-Z][A-Z0-9-]+$/.test(id)),
    ),
  ).slice(0, MAX_SENTRY_IDS_PER_CALL);

  if (ids.length === 0) {
    return { status: "ready", org: "", issues: [], misses: [] };
  }

  const config = readSentryConfig();
  if ("missing" in config) {
    return {
      status: "disabled",
      message: `Sentry integration is not configured (${config.missing.join(", ")}).`,
    };
  }

  const issues: SentryIssueSnapshot[] = [];
  const misses: string[] = [];

  const results = await Promise.allSettled(
    ids.map(async (shortId): Promise<SentryIssueSnapshot | { miss: string }> => {
      const url = `${config.base}/organizations/${encodeURIComponent(
        config.org,
      )}/issues/?query=${encodeURIComponent(shortId)}&shortIdLookup=1&limit=1`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
        signal: createTimeoutSignal(SENTRY_ISSUE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { miss: `${shortId}: Sentry ${response.status}` };
      }
      const body = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(body) || body.length === 0) {
        return { miss: `${shortId}: not found in org` };
      }
      const issue = body[0];
      const snapshot: SentryIssueSnapshot = {
        shortId: String(issue.shortId ?? shortId),
        title: String(issue.title ?? "(no title)"),
        status: String(issue.status ?? "unknown"),
        level: String(issue.level ?? "unknown"),
        count: Number(issue.count ?? 0),
        userCount: Number(issue.userCount ?? 0),
        firstSeen: String(issue.firstSeen ?? ""),
        lastSeen: String(issue.lastSeen ?? ""),
        permalink: String(issue.permalink ?? ""),
        evidenceLine: "",
      };
      snapshot.evidenceLine = formatEvidenceLine(snapshot);
      return snapshot;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if ("miss" in result.value) misses.push(result.value.miss);
      else issues.push(result.value);
    } else {
      misses.push(
        `(unknown id): ${result.reason instanceof Error ? result.reason.message : "fetch error"}`,
      );
    }
  }

  return { status: "ready", org: config.org, issues, misses };
}

function formatEvidenceLine(issue: SentryIssueSnapshot): string {
  const seen = issue.lastSeen ? `last seen ${issue.lastSeen.slice(0, 10)}` : "no last-seen timestamp";
  return `Sentry ${issue.shortId} — ${issue.status} (${issue.level}) · ${issue.count} events / ${issue.userCount} users · ${seen} · ${issue.permalink}`;
}
