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
  // The /queue overview page surfaces these directly:
  // - `labels` powers the "Launch blocker" pill (Jira label `launch-blocker`).
  // - `hasAgentTestUpdate` / `hasHumanTestResult` light up "AI summary" / "Human
  //   result" pills without forcing the page to re-parse comment bodies.
  labels: string[];
  hasAgentTestUpdate: boolean;
  hasHumanTestResult: boolean;
};

export type QueueRow = QueueCandidate & {
  score: number;
  reasons: string[];
  ageInStatusHours: number;
  hasBuild: boolean;
  hasHumanReady: boolean;
  surfaceList: string[];
};

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

function extractLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      out.push(entry.trim());
    } else if (entry && typeof entry === "object") {
      const named = asString((entry as Record<string, unknown>).name);
      if (named) out.push(named);
    }
  }
  return out;
}

// Walk an ADF document (or any nested object) and concatenate every `text`
// node. We can't import adfToPlainText from mvp-ticket-checklist.ts without
// pulling in that whole module (and breaking the node --test isolation this
// file deliberately keeps), so this is a tiny duplicate scoped to label
// detection — text nodes only, no formatting needed.
function collectAdfText(node: unknown, parts: string[]): void {
  if (!node) return;
  if (typeof node === "string") {
    parts.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectAdfText(child, parts);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") parts.push(record.text);
  if (Array.isArray(record.content)) collectAdfText(record.content, parts);
}

function commentBodyToText(body: unknown): string {
  if (typeof body === "string") return body;
  const parts: string[] = [];
  collectAdfText(body, parts);
  return parts.join(" ");
}

function scanComments(value: unknown): { hasAgentTestUpdate: boolean; hasHumanTestResult: boolean } {
  // Jira's search/jql returns comments as `{ comments: [...], total, ... }`
  // when the `comment` field is requested. Be tolerant of either shape: a
  // bare array, a wrapper object, or missing entirely.
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (value && typeof value === "object") {
    const wrapper = value as Record<string, unknown>;
    if (Array.isArray(wrapper.comments)) list = wrapper.comments;
  }

  let hasAgentTestUpdate = false;
  let hasHumanTestResult = false;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = commentBodyToText(record.body);
    if (!text) continue;
    if (!hasAgentTestUpdate && /agent test update/i.test(text)) hasAgentTestUpdate = true;
    if (!hasHumanTestResult && /human test result/i.test(text)) hasHumanTestResult = true;
    if (hasAgentTestUpdate && hasHumanTestResult) break;
  }
  return { hasAgentTestUpdate, hasHumanTestResult };
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
  const labels = extractLabels(fields.labels);
  const { hasAgentTestUpdate, hasHumanTestResult } = scanComments(fields.comment);

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
    labels,
    hasAgentTestUpdate,
    hasHumanTestResult,
  };
}

export function isTestable(candidate: QueueCandidate): boolean {
  const status = candidate.status.toLowerCase();
  if (SKIP_STATUSES.has(status)) return false;
  if (candidate.humanFinalReview.toLowerCase() === "passed") return false;

  // A ticket is only "ready for John/Tay to test" when there's evidence the
  // agent has handed it over. Without one of these signals, opening the
  // ticket in Buddy will land on a STOP page — never suggest those.
  const review = candidate.humanFinalReview.toLowerCase();
  const stage = candidate.loopStage.toLowerCase();
  const buildField = candidate.verifiedBuildOrCommit.toLowerCase();
  const hasBuild = Boolean(buildField) && buildField !== "not set";
  const stageReady = stage.includes("verifying") || stage.includes("in build") || stage.includes("ci green");

  if (status.includes("verifying")) return true;
  if (review === "ready") return true;
  if (stageReady) return true;
  if (hasBuild) return true;

  return false;
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

// Builds a "thin" QueueRow for candidates that aren't ranked (because
// they're not yet testable). The /queue overview groups by status — it
// needs to render "In progress" and "Waiting to start" cards even when
// rankCandidates would skip them. Score is set to 0 with no reasons so a
// caller can still merge these into the ranked list without surprising the
// ranker. Kept here so the ticket-queue module stays the single source of
// truth for QueueRow shape.
export function describeCandidate(candidate: QueueCandidate, now: number = Date.now()): QueueRow {
  const buildField = candidate.verifiedBuildOrCommit.toLowerCase();
  const hasBuild = Boolean(buildField) && buildField !== "not set";
  const hasHumanReady = candidate.humanFinalReview.toLowerCase() === "ready";
  return {
    ...candidate,
    score: 0,
    reasons: [],
    ageInStatusHours: ageHours(candidate.statusChangedAt, now),
    hasBuild,
    hasHumanReady,
    surfaceList: compactSurfaces(candidate.verificationSurface).map(describeSurface),
  };
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
  "labels",
  "comment",
  MVP_CUSTOM_FIELDS.mvpTrack,
  MVP_CUSTOM_FIELDS.loopStage,
  MVP_CUSTOM_FIELDS.verificationSurface,
  MVP_CUSTOM_FIELDS.humanFinalReview,
  MVP_CUSTOM_FIELDS.verifiedBuildOrCommit,
];
