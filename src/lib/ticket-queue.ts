// Ranking + filtering for the "What should I test next?" queue.
//
// The Jira search returns raw candidates; this module decides which are
// testable, scores them, and explains why each made the top of the list.
//
// Pure logic — no IO. Network code lives in api/queue/route.ts.
// MVP_CUSTOM_FIELDS is duplicated from mvp-ticket-checklist.ts so that this
// module has no relative-import dependency — keeps Node's test runner happy
// (which needs explicit .ts extensions) without forcing the rest of the codebase
// to adopt them. Keep these IDs in sync with the source of truth.

const MVP_CUSTOM_FIELDS = {
  mvpTrack: "customfield_10043",
  loopStage: "customfield_10044",
  verificationSurface: "customfield_10045",
  humanFinalReview: "customfield_10046",
  verifiedBuildOrCommit: "customfield_10047",
} as const;

export type RawJiraCandidate = {
  key: string;
  fields?: {
    summary?: unknown;
    status?: unknown;
    priority?: unknown;
    updated?: unknown;
    statuscategorychangedate?: unknown;
    issuelinks?: unknown;
    [key: string]: unknown;
  };
};

export type QueueCandidate = {
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
};

export type QueueRow = QueueCandidate & {
  score: number;
  reasons: string[];
  ageInStatusHours: number;
  hasBuild: boolean;
  hasHumanReady: boolean;
  surfaceList: string[];
};

const TESTABLE_STATUSES = new Set(
  ["in progress", "verifying", "human verifying", "selected"].map((s) => s.toLowerCase()),
);

const SKIP_STATUSES = new Set(["done", "passed", "closed", "won't do", "wont do"].map((s) => s.toLowerCase()));

const PRIORITY_WEIGHTS: Record<string, number> = {
  highest: 20,
  high: 10,
  medium: 0,
  low: -5,
  lowest: -10,
};

const TRACK_RISK_WEIGHTS: Record<string, number> = {
  auth: 5,
  crypto: 5,
  noise: 5,
  transport: 5,
  ble: 4,
  push: 4,
  relay: 4,
  observability: 1,
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") return record.value;
    if (typeof record.name === "string") return record.name;
    if (typeof record.displayName === "string") return record.displayName;
  }
  return "";
}

function asNamed(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return asString(record.name) || asString(record.value) || "";
}

function statusName(value: unknown): string {
  return asNamed(value);
}

function priorityName(value: unknown): string {
  return asNamed(value) || "Medium";
}

function extractIssueLinks(value: unknown): { blocksKeys: string[]; blockedByKeys: string[] } {
  const result = { blocksKeys: [] as string[], blockedByKeys: [] as string[] };
  if (!Array.isArray(value)) return result;

  for (const link of value) {
    if (!link || typeof link !== "object") continue;
    const record = link as Record<string, unknown>;
    const type = record.type && typeof record.type === "object" ? (record.type as Record<string, unknown>) : {};
    const typeName = (asString(type.name) || "").toLowerCase();
    if (!typeName.includes("block")) continue;

    const inwardIssue = record.inwardIssue;
    const outwardIssue = record.outwardIssue;
    const isOutward = Boolean(outwardIssue);
    const issue = isOutward ? outwardIssue : inwardIssue;
    if (!issue || typeof issue !== "object") continue;
    const issueKey = asString((issue as Record<string, unknown>).key);
    if (!issueKey) continue;

    if (isOutward) {
      result.blocksKeys.push(issueKey);
    } else {
      result.blockedByKeys.push(issueKey);
    }
  }
  return result;
}

export function normaliseCandidate(raw: RawJiraCandidate): QueueCandidate | null {
  const fields = raw.fields || {};
  if (!raw.key) return null;
  const status = statusName(fields.status);
  const lowerStatus = status.toLowerCase();
  if (SKIP_STATUSES.has(lowerStatus)) return null;

  const links = extractIssueLinks(fields.issuelinks);

  return {
    issueKey: raw.key,
    summary: asString(fields.summary) || "(no summary)",
    status,
    priority: priorityName(fields.priority),
    mvpTrack: asNamed(fields[MVP_CUSTOM_FIELDS.mvpTrack]),
    loopStage: asNamed(fields[MVP_CUSTOM_FIELDS.loopStage]),
    verificationSurface: asNamed(fields[MVP_CUSTOM_FIELDS.verificationSurface]),
    humanFinalReview: asNamed(fields[MVP_CUSTOM_FIELDS.humanFinalReview]),
    verifiedBuildOrCommit: asString(fields[MVP_CUSTOM_FIELDS.verifiedBuildOrCommit]),
    updatedAt: asString(fields.updated),
    statusChangedAt: asString(fields.statuscategorychangedate) || asString(fields.updated),
    blocksKeys: links.blocksKeys,
    blockedByKeys: links.blockedByKeys,
  };
}

export function isTestable(candidate: QueueCandidate): boolean {
  const status = candidate.status.toLowerCase();
  if (SKIP_STATUSES.has(status)) return false;
  if (candidate.humanFinalReview.toLowerCase() === "passed") return false;
  return TESTABLE_STATUSES.has(status) || candidate.loopStage.toLowerCase().includes("verifying");
}

function ageHours(iso: string, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / (1000 * 60 * 60));
}

function trackRiskWeight(track: string): number {
  if (!track) return 0;
  const lower = track.toLowerCase();
  for (const [key, weight] of Object.entries(TRACK_RISK_WEIGHTS)) {
    if (lower.includes(key)) return weight;
  }
  return 0;
}

function priorityWeight(priority: string): number {
  return PRIORITY_WEIGHTS[priority.toLowerCase()] ?? 0;
}

function compactSurfaces(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const SHORT_SURFACE_HINT: Record<string, string> = {
  automated: "auto",
  simulator: "sim",
  "one phone": "1-phone",
  "two phones": "2-phones",
  testflight: "TestFlight",
  "testflight/apns": "TestFlight",
  apns: "APNs",
  ble: "BLE",
  "worker smoke": "worker",
  "sentry watch": "Sentry",
};

function describeSurface(surface: string): string {
  const lower = surface.toLowerCase();
  return SHORT_SURFACE_HINT[lower] || surface;
}

export type RankInputs = {
  candidates: QueueCandidate[];
  recentlyLoadedKeys?: Set<string>;
  now?: number;
};

export function rankCandidates({ candidates, recentlyLoadedKeys, now = Date.now() }: RankInputs): QueueRow[] {
  const rows: QueueRow[] = [];

  for (const candidate of candidates) {
    if (!isTestable(candidate)) continue;

    const ageInStatusHours = ageHours(candidate.statusChangedAt, now);
    const reasons: string[] = [];
    let score = 0;

    score += ageInStatusHours;
    if (ageInStatusHours >= 24) {
      reasons.push(`Sitting ${Math.round(ageInStatusHours)}h — getting stale`);
    } else if (ageInStatusHours >= 4) {
      reasons.push(`In ${candidate.status} for ${Math.round(ageInStatusHours)}h`);
    }

    if (candidate.blocksKeys.length > 0) {
      score += candidate.blocksKeys.length * 5;
      reasons.push(
        `Blocks ${candidate.blocksKeys.length} other ticket${candidate.blocksKeys.length === 1 ? "" : "s"} (${candidate.blocksKeys
          .slice(0, 2)
          .join(", ")}${candidate.blocksKeys.length > 2 ? "…" : ""})`,
      );
    }

    const pWeight = priorityWeight(candidate.priority);
    score += pWeight;
    if (candidate.priority && candidate.priority.toLowerCase() === "highest") {
      reasons.push("Priority: Highest");
    } else if (candidate.priority && candidate.priority.toLowerCase() === "high") {
      reasons.push("Priority: High");
    }

    const rWeight = trackRiskWeight(candidate.mvpTrack);
    score += rWeight;

    const hasBuild = Boolean(candidate.verifiedBuildOrCommit && candidate.verifiedBuildOrCommit.toLowerCase() !== "not set");
    if (hasBuild) {
      score += 3;
      reasons.push(`build ${candidate.verifiedBuildOrCommit}`);
    } else {
      reasons.push("no build named yet");
    }

    const hasHumanReady = candidate.humanFinalReview.toLowerCase() === "ready";
    if (hasHumanReady) {
      score += 4;
      reasons.push("Human Final Review: Ready");
    }

    if (recentlyLoadedKeys && recentlyLoadedKeys.has(candidate.issueKey)) {
      score -= 15;
      reasons.push("recently opened by someone");
    }

    rows.push({
      ...candidate,
      score,
      reasons,
      ageInStatusHours,
      hasBuild,
      hasHumanReady,
      surfaceList: compactSurfaces(candidate.verificationSurface).map(describeSurface),
    });
  }

  rows.sort((a, b) => b.score - a.score || b.ageInStatusHours - a.ageInStatusHours);
  return rows;
}

export function buildQueueJql(): string {
  // Status-based filter; the JQL keeps the result set small. Re-ranking happens
  // server-side. Excluding Done/Passed states up front saves a round-trip.
  return [
    'project = BDEV',
    'AND status in ("In Progress", "Verifying", "Selected")',
    'AND statusCategory != "Done"',
    'ORDER BY updated DESC',
  ].join(" ");
}

export const QUEUE_FIELDS = [
  "summary",
  "status",
  "priority",
  "updated",
  "statuscategorychangedate",
  "issuelinks",
  MVP_CUSTOM_FIELDS.mvpTrack,
  MVP_CUSTOM_FIELDS.loopStage,
  MVP_CUSTOM_FIELDS.verificationSurface,
  MVP_CUSTOM_FIELDS.humanFinalReview,
  MVP_CUSTOM_FIELDS.verifiedBuildOrCommit,
];
