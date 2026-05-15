// Cowork v1 — shared helpers for the Sentry → Jira-draft cron and the
// /api/cowork/* dashboard routes.
//
// BDEV-510. Read alongside `docs/cowork/v1-runbook.md`.
//
// Cowork's job in v1: each hour, look at new Sentry issues, build a
// fingerprint, check Jira for an existing matching ticket, and (in live
// mode) file a draft ticket the operator can promote. In shadow mode the
// same logic runs but no Jira write happens. Every decision — file,
// dedup, skip, error — gets an audit-log line so John can sanity-check
// the cron without staring at terminal logs.
//
// The seven guardrails (BDEV-510) are enforced by `evaluateGuardrails`
// at the top of `/api/cowork/run`. Each guardrail maps to one or more
// env vars listed below.

import crypto from "node:crypto";

// ---------- Env / config ----------

export const COWORK_LABEL_DRAFT = "cowork-draft";
export const COWORK_LABEL_REJECTED = "cowork-rejected";
export const COWORK_LABEL_PROMOTED = "cowork-promoted";

// All Cowork-filed tickets carry both the generic `cowork-draft` label
// and a per-fingerprint label so dedup search is a fast JQL match
// instead of full-text scanning Jira descriptions.
export function fingerprintLabel(fingerprint: string): string {
  return `cowork-fingerprint-${fingerprint}`;
}

export type CoworkMode = "shadow" | "live";

export type CoworkConfig = {
  enabled: boolean;
  mode: CoworkMode;
  maxPerHour: number;
  maxPerDay: number;
  maxTokensPerDay: number;
  sentryOrg: string;
  sentryProject: string;
  sentryAuthToken: string | null;
  anthropicApiKey: string | null;
  cronSecret: string | null;
};

export function readCoworkConfig(): CoworkConfig {
  const mode = (process.env.COWORK_MODE || "shadow").toLowerCase();
  return {
    // Default: disabled. Operator must flip COWORK_ENABLED=true.
    enabled: parseBool(process.env.COWORK_ENABLED, false),
    mode: mode === "live" ? "live" : "shadow",
    maxPerHour: parseInt(process.env.COWORK_MAX_TICKETS_PER_HOUR, 3),
    maxPerDay: parseInt(process.env.COWORK_MAX_TICKETS_PER_DAY, 15),
    maxTokensPerDay: parseInt(process.env.COWORK_MAX_ANTHROPIC_TOKENS_PER_DAY, 1_000_000),
    sentryOrg: process.env.SENTRY_ORG || "heyblip",
    sentryProject: process.env.SENTRY_PROJECT || "apple-ios",
    sentryAuthToken: process.env.SENTRY_AUTH_TOKEN || null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY || null,
    // Vercel's documented cron-auth env var is `CRON_SECRET` (sent as
    // `Authorization: Bearer ${CRON_SECRET}`); we accept the older
    // `COWORK_CRON_SECRET` as a fallback so existing operator setups
    // don't silently break. Set whichever — if both are set, CRON_SECRET
    // wins. See review by John, 2026-05-15.
    cronSecret: process.env.CRON_SECRET || process.env.COWORK_CRON_SECRET || null,
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  const lowered = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(lowered)) return true;
  if (["0", "false", "no", "off", ""].includes(lowered)) return false;
  return fallback;
}

function parseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// ---------- KV counters (rate limits + budget) ----------

type KvClient = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
  incrby: (key: string, by: number) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
  mget: <T>(...keys: string[]) => Promise<Array<T | null>>;
};

let cachedKv: KvClient | null | undefined;

async function loadKv(): Promise<KvClient | null> {
  if (cachedKv !== undefined) return cachedKv;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    cachedKv = null;
    return null;
  }
  try {
    const mod = (await import("@vercel/kv")) as { kv: KvClient };
    cachedKv = mod.kv;
  } catch {
    cachedKv = null;
  }
  return cachedKv;
}

const KV_PREFIX = "cowork:";
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

function hourKey(now: Date): string {
  // UTC hour bucket: 2026-05-15T07
  const iso = now.toISOString();
  return `${KV_PREFIX}rate:hour:${iso.slice(0, 13)}`;
}

function dayKey(now: Date): string {
  // UTC day bucket: 2026-05-15
  const iso = now.toISOString();
  return `${KV_PREFIX}rate:day:${iso.slice(0, 10)}`;
}

function tokenDayKey(now: Date): string {
  const iso = now.toISOString();
  return `${KV_PREFIX}tokens:day:${iso.slice(0, 10)}`;
}

const CURSOR_KEY = `${KV_PREFIX}sentry:cursor`;

export type CoworkCounters = {
  filedThisHour: number;
  filedThisDay: number;
  tokensSpentToday: number;
  kvAvailable: boolean;
};

export async function readCounters(now: Date = new Date()): Promise<CoworkCounters> {
  const kv = await loadKv();
  if (!kv) {
    return { filedThisHour: 0, filedThisDay: 0, tokensSpentToday: 0, kvAvailable: false };
  }
  try {
    const [h, d, t] = await kv.mget<number>(hourKey(now), dayKey(now), tokenDayKey(now));
    return {
      filedThisHour: Number(h || 0),
      filedThisDay: Number(d || 0),
      tokensSpentToday: Number(t || 0),
      kvAvailable: true,
    };
  } catch {
    return { filedThisHour: 0, filedThisDay: 0, tokensSpentToday: 0, kvAvailable: false };
  }
}

export async function recordFiledTicket(now: Date = new Date()): Promise<void> {
  const kv = await loadKv();
  if (!kv) return;
  try {
    const hk = hourKey(now);
    const dk = dayKey(now);
    await kv.incrby(hk, 1);
    await kv.expire(hk, SECONDS_PER_HOUR * 2);
    await kv.incrby(dk, 1);
    await kv.expire(dk, SECONDS_PER_DAY * 2);
  } catch {
    // Counter failure must not block the audit log; we surface kvAvailable
    // in the audit payload so the operator notices if rate limits stop
    // working.
  }
}

export async function recordTokenSpend(tokens: number, now: Date = new Date()): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const kv = await loadKv();
  if (!kv) return;
  try {
    const key = tokenDayKey(now);
    await kv.incrby(key, Math.round(tokens));
    await kv.expire(key, SECONDS_PER_DAY * 2);
  } catch {
    // Token-budget enforcement degrades to "best effort if KV is up".
  }
}

export async function readSentryCursor(): Promise<string | null> {
  const kv = await loadKv();
  if (!kv) return null;
  try {
    return await kv.get<string>(CURSOR_KEY);
  } catch {
    return null;
  }
}

export async function writeSentryCursor(cursor: string): Promise<void> {
  const kv = await loadKv();
  if (!kv) return;
  try {
    // Cursor lives for 30 days — Sentry events older than that are
    // unlikely to need filing anyway.
    await kv.set(CURSOR_KEY, cursor, { ex: SECONDS_PER_DAY * 30 });
  } catch {
    // No-op; on next run we just fall back to the default lookback.
  }
}

// ---------- Guardrail evaluation ----------

export type GuardrailDecision =
  | { ok: true; mode: CoworkMode; counters: CoworkCounters }
  | { ok: false; reason: string; details?: Record<string, unknown> };

export function evaluateGuardrails(
  config: CoworkConfig,
  counters: CoworkCounters,
): GuardrailDecision {
  if (!config.enabled) {
    return { ok: false, reason: "kill-switch:disabled" };
  }
  if (counters.filedThisHour >= config.maxPerHour) {
    return {
      ok: false,
      reason: "rate-limit:hour",
      details: { filedThisHour: counters.filedThisHour, max: config.maxPerHour },
    };
  }
  if (counters.filedThisDay >= config.maxPerDay) {
    return {
      ok: false,
      reason: "rate-limit:day",
      details: { filedThisDay: counters.filedThisDay, max: config.maxPerDay },
    };
  }
  if (counters.tokensSpentToday >= config.maxTokensPerDay) {
    return {
      ok: false,
      reason: "budget:tokens-day",
      details: { tokensSpentToday: counters.tokensSpentToday, max: config.maxTokensPerDay },
    };
  }
  return { ok: true, mode: config.mode, counters };
}

// ---------- Fingerprinting ----------

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  level: string;
  count: string | number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  platform: string;
  project: { name: string; slug: string };
  metadata: { type?: string; value?: string; filename?: string; function?: string };
  tags?: Array<{ key: string; value: string }>;
};

// Fingerprint = stable hash of Sentry issue id + culprit + first-frame
// function. We use the Sentry id as the primary anchor because Sentry
// itself does the heavy lifting on grouping; culprit + frame are only
// added so that if Sentry ever regroups an issue, our label still
// collides with previously-filed tickets.
export function buildFingerprint(issue: SentryIssue): string {
  const seed = [
    issue.id || "",
    issue.culprit || "",
    issue.metadata?.function || "",
  ].join("|");
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

// ---------- Epic catalogue routing ----------

// Mirrors the BDEV Epic catalogue from heyblip/CLAUDE.md.
// Routing rule: scan culprit + metadata for the most-specific match;
// fall back to Observability (BDEV-386) because Sentry-driven tickets
// are observability tickets unless they're clearly auth/chat/push.
type EpicRoute = { tag: string; key: string; match: RegExp };

const EPIC_ROUTES: EpicRoute[] = [
  { tag: "[PUSH]", key: "BDEV-380", match: /push|apns|nse|notification/i },
  { tag: "[AUTH]", key: "BDEV-382", match: /auth|token|jwt|login|session|account-not-found/i },
  { tag: "[CHAT]", key: "BDEV-383", match: /chat|dm|message|attachment|reaction|conversation/i },
  { tag: "[NOISE]", key: "BDEV-385", match: /noise|handshake|ble|bluetooth|crypto|relay|websocket|ws/i },
  { tag: "[WEB]", key: "BDEV-388", match: /\bweb\b|next|next\.js|tsx|jsx|browser/i },
];

const DEFAULT_EPIC = { tag: "[SENTRY]", key: "BDEV-386" }; // Observability

export function routeToEpic(issue: SentryIssue): { tag: string; key: string } {
  const haystack = [
    issue.culprit || "",
    issue.title || "",
    issue.metadata?.filename || "",
    issue.metadata?.function || "",
    issue.metadata?.type || "",
  ]
    .filter(Boolean)
    .join(" ");
  for (const route of EPIC_ROUTES) {
    if (route.match.test(haystack)) return { tag: route.tag, key: route.key };
  }
  return DEFAULT_EPIC;
}

// ---------- Sentry API ----------

export async function fetchSentryIssues(
  config: CoworkConfig,
  options: { sinceTimestamp?: string | null; limit?: number } = {},
): Promise<{ issues: SentryIssue[]; rawCount: number }> {
  if (!config.sentryAuthToken) {
    throw new Error("SENTRY_AUTH_TOKEN is not configured");
  }
  const limit = options.limit ?? 25;
  const params = new URLSearchParams({
    statsPeriod: "24h",
    sort: "new",
    limit: String(limit),
  });
  if (options.sinceTimestamp) {
    // Sentry's query DSL — "age:-Nh" filters by lastSeen age. We use
    // the cursor as a lastSeen filter so we only see issues that have
    // had recent events.
    params.set("query", `is:unresolved firstSeen:>${options.sinceTimestamp}`);
  } else {
    params.set("query", "is:unresolved");
  }
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(
    config.sentryOrg,
  )}/${encodeURIComponent(config.sentryProject)}/issues/?${params.toString()}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.sentryAuthToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Sentry returned ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SentryIssue[];
  return { issues: Array.isArray(body) ? body : [], rawCount: Array.isArray(body) ? body.length : 0 };
}

// ---------- Anthropic description generation ----------

const ANTHROPIC_MODEL = process.env.COWORK_ANTHROPIC_MODEL || "claude-haiku-4-5";
const ANTHROPIC_TIMEOUT_MS = 15000;

export type DraftDescription = {
  summary: string;
  description: string;
  tokensUsed: number;
  source: "anthropic" | "fallback";
};

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// Builds a prompt that matches the well-structured BDEV ticket voice
// (Headline / Why / In scope / Out of scope / Acceptance / Workflow /
// Verification Surface). The model receives the Sentry issue metadata
// only — no raw stack traces — so the description is grounded in
// observable facts.
function buildPrompt(issue: SentryIssue, epicTag: string, fingerprint: string): string {
  const tags = (issue.tags || [])
    .slice(0, 8)
    .map((t) => `${t.key}=${t.value}`)
    .join(", ");
  return [
    `You are filing a Jira BDEV draft ticket from a Sentry issue. Match the existing BDEV voice — calm, factual, no marketing.`,
    `Sentry issue:`,
    `- ID: ${issue.shortId} (${issue.id})`,
    `- Title: ${issue.title}`,
    `- Culprit: ${issue.culprit || "(unknown)"}`,
    `- Type: ${issue.metadata?.type || "(unknown)"}`,
    `- Function: ${issue.metadata?.function || "(unknown)"}`,
    `- File: ${issue.metadata?.filename || "(unknown)"}`,
    `- Platform: ${issue.platform}`,
    `- Events (24h): ${issue.count}`,
    `- Users affected: ${issue.userCount}`,
    `- First seen: ${issue.firstSeen}`,
    `- Last seen: ${issue.lastSeen}`,
    `- Tags: ${tags || "(none)"}`,
    `- Permalink: ${issue.permalink}`,
    ``,
    `Return JSON with this exact shape (no markdown fences, no commentary):`,
    `{`,
    `  "summary": "${epicTag} <short imperative description, <= 80 chars>",`,
    `  "description": "<full ticket body, see template below>"`,
    `}`,
    ``,
    `The description MUST follow this template, with section headers in this order, and be plain text with markdown (## headers, - bullets):`,
    `## Headline`,
    `<1-2 sentences naming the failing symbol/path and what observable behavior is broken.>`,
    ``,
    `## Why this matters`,
    `<1-2 sentences on user-visible impact, grounded only in the Sentry counts/tags. Do not speculate beyond evidence.>`,
    ``,
    `## In scope`,
    `- <bullet 1>`,
    `- <bullet 2>`,
    `- <bullet 3>`,
    ``,
    `## Out of scope`,
    `- <bullet>`,
    `- <bullet>`,
    ``,
    `## Acceptance`,
    `- [ ] <acceptance criterion>`,
    `- [ ] <acceptance criterion>`,
    `- [ ] Sentry issue ${issue.shortId} shows no new events for 7 days after the fix lands`,
    ``,
    `## Workflow`,
    `Branch off latest main as fix/BDEV-NNN-<short-name>. Open PR against main, post link in #blip-dev. STOP at PR open — John merges.`,
    ``,
    `## Verification Surface`,
    `Sentry Watch — release/build named in the fix PR, watch window 7 days, pass condition is "no new events on issue ${issue.shortId}".`,
    ``,
    `## Cowork metadata`,
    `- Filed by Cowork v1 (BDEV-510)`,
    `- Fingerprint: ${fingerprint}`,
    `- Sentry issue: ${issue.permalink}`,
    ``,
    `Rules:`,
    `- Do NOT invent facts. If something is unknown from the Sentry metadata, write "unknown".`,
    `- Keep each section short. The reader is an operator triaging fast, not reading a novel.`,
    `- Use the same plain, factual voice as the existing BDEV tickets.`,
  ].join("\n");
}

// Two paths: if ANTHROPIC_API_KEY is set we go direct to the Anthropic
// API. Otherwise if OPENROUTER_API_KEY is set we use OpenRouter (same
// pattern Buddy's /coach uses). In either case the prompt and JSON
// shape are identical so the caller doesn't care which provider ran.
export async function generateDraftDescription(
  issue: SentryIssue,
  epicTag: string,
  fingerprint: string,
  apiKey: string,
): Promise<DraftDescription> {
  const prompt = buildPrompt(issue, epicTag, fingerprint);
  const isAnthropicNative = apiKey.startsWith("sk-ant-");

  if (isAnthropicNative) {
    return generateViaAnthropic(prompt, apiKey, issue);
  }
  return generateViaOpenRouter(prompt, apiKey, issue);
}

async function generateViaAnthropic(
  prompt: string,
  apiKey: string,
  issue: SentryIssue,
): Promise<DraftDescription> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: createTimeoutSignal(ANTHROPIC_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }
  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (body.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("");
  const tokensUsed = (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0);
  return parseDraftJson(text, issue, tokensUsed, "anthropic");
}

async function generateViaOpenRouter(
  prompt: string,
  apiKey: string,
  issue: SentryIssue,
): Promise<DraftDescription> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: createTimeoutSignal(ANTHROPIC_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3049",
      "X-OpenRouter-Title": "HeyBlip Cowork v1",
    },
    body: JSON.stringify({
      model: process.env.COWORK_OPENROUTER_MODEL || "anthropic/claude-haiku-4.5",
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content || "";
  const tokensUsed = (body.usage?.prompt_tokens || 0) + (body.usage?.completion_tokens || 0);
  return parseDraftJson(text, issue, tokensUsed, "anthropic");
}

function parseDraftJson(
  text: string,
  issue: SentryIssue,
  tokensUsed: number,
  source: DraftDescription["source"],
): DraftDescription {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return buildFallbackDescription(issue, tokensUsed);
  }
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1)) as {
      summary?: string;
      description?: string;
    };
    if (typeof parsed.summary !== "string" || typeof parsed.description !== "string") {
      return buildFallbackDescription(issue, tokensUsed);
    }
    return {
      summary: parsed.summary.trim().slice(0, 240),
      description: parsed.description.trim(),
      tokensUsed,
      source,
    };
  } catch {
    return buildFallbackDescription(issue, tokensUsed);
  }
}

// Deterministic, no-AI fallback. Used when ANTHROPIC_API_KEY is missing
// or the model call fails. The draft is still well-structured so the
// operator can promote it; the AI just won't have phrased it.
export function buildFallbackDescription(issue: SentryIssue, tokensUsed = 0): DraftDescription {
  const fingerprint = buildFingerprint(issue);
  const epic = routeToEpic(issue);
  const summary = `${epic.tag} ${truncate(issue.title || issue.shortId || "Sentry issue", 80)}`;
  const description = [
    "## Headline",
    `Sentry issue \`${issue.shortId}\` — \`${issue.metadata?.type || "error"}\` at \`${issue.culprit || issue.metadata?.function || "unknown"}\`.`,
    "",
    "## Why this matters",
    `${issue.count} events in the last 24h affecting ${issue.userCount} users. Drafted by Cowork v1 — operator should confirm impact and Epic routing before promoting.`,
    "",
    "## In scope",
    `- Investigate \`${issue.metadata?.function || issue.culprit || "the failing symbol"}\` at \`${issue.metadata?.filename || "the file named in Sentry"}\`.`,
    "- Reproduce or rule out, then fix or close as wontfix with a comment naming the trigger.",
    `- Watch Sentry issue ${issue.shortId} after the fix.`,
    "",
    "## Out of scope",
    "- Unrelated work in the same file. Keep the diff minimal.",
    "- Refactoring not required to fix this exact error shape.",
    "",
    "## Acceptance",
    "- [ ] Root cause identified or ruled out with a comment naming the trigger",
    "- [ ] Fix lands or ticket closed as wontfix with reasoning",
    `- [ ] Sentry issue ${issue.shortId} shows no new events for 7 days after the fix`,
    "",
    "## Workflow",
    "Branch off latest main as `fix/BDEV-NNN-<short-name>`. Open PR against main, post link in #blip-dev. STOP at PR open — John merges.",
    "",
    "## Verification Surface",
    `Sentry Watch — release/build named in the fix PR, watch window 7 days, pass condition is "no new events on issue ${issue.shortId}".`,
    "",
    "## Cowork metadata",
    "- Filed by Cowork v1 (BDEV-510)",
    `- Fingerprint: ${fingerprint}`,
    `- Sentry issue: ${issue.permalink}`,
  ].join("\n");
  return { summary, description, tokensUsed, source: "fallback" };
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

// ---------- Audit log ----------

export type AuditDecision =
  | "filed"
  | "would-file"
  | "dedup"
  | "skipped"
  | "guardrail-block"
  | "ai-error"
  | "jira-error"
  | "no-new-events"
  | "disabled";

export type AuditEntry = {
  ts: string;
  decision: AuditDecision;
  reason: string;
  mode: CoworkMode | "n/a";
  sentryShortId?: string;
  sentryUrl?: string;
  fingerprint?: string;
  jiraKey?: string;
  matchedKey?: string;
  tokensUsed?: number;
  details?: Record<string, unknown>;
};

export function newAuditEntry(partial: Omit<AuditEntry, "ts">): AuditEntry {
  return { ts: new Date().toISOString(), ...partial };
}

// Persistent audit log: store the last N entries in KV as a ring buffer
// so the /api/cowork/audit endpoint can render them. We ALSO append to
// a dedicated Jira audit ticket if COWORK_AUDIT_ISSUE_KEY is set — this
// gives John a Jira-native paper trail he can scroll through alongside
// regular tickets.
const AUDIT_KEY = `${KV_PREFIX}audit:recent`;
const AUDIT_MAX_ENTRIES = 200;

export async function appendAuditLog(entries: AuditEntry[]): Promise<void> {
  if (!entries.length) return;
  const kv = await loadKv();
  if (!kv) return;
  try {
    const existing = (await kv.get<AuditEntry[]>(AUDIT_KEY)) || [];
    const merged = [...entries, ...existing].slice(0, AUDIT_MAX_ENTRIES);
    await kv.set(AUDIT_KEY, merged, { ex: SECONDS_PER_DAY * 30 });
  } catch {
    // Audit log is the operator's eye into Cowork — if KV is down we
    // log to stdout instead so it shows up in Vercel function logs.
    for (const entry of entries) {
      console.log("[cowork:audit:fallback]", JSON.stringify(entry));
    }
  }
}

export async function readAuditLog(limit = 50): Promise<AuditEntry[]> {
  const kv = await loadKv();
  if (!kv) return [];
  try {
    const entries = (await kv.get<AuditEntry[]>(AUDIT_KEY)) || [];
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

export function formatAuditEntryAsText(entry: AuditEntry): string {
  const parts = [
    entry.ts,
    `[${entry.mode}]`,
    entry.decision.toUpperCase(),
    entry.sentryShortId ? `sentry=${entry.sentryShortId}` : "",
    entry.fingerprint ? `fp=${entry.fingerprint}` : "",
    entry.jiraKey ? `jira=${entry.jiraKey}` : "",
    entry.matchedKey ? `matched=${entry.matchedKey}` : "",
    entry.tokensUsed ? `tokens=${entry.tokensUsed}` : "",
    `reason=${entry.reason}`,
  ];
  return parts.filter(Boolean).join(" ");
}

// ---------- Access gate ----------

export function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function isCoworkAccessAllowed(access?: string | null): boolean {
  if (!needsAccessGate()) return true;
  // Reuse the existing Buddy access key so the operator doesn't juggle
  // two tokens for what feels like one dashboard.
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

// Cron-route auth: Vercel cron requests carry a CRON_SECRET in the
// Authorization header. We accept either that OR the standard access
// key (so operators can hit /run manually from a browser for testing).
export function isCronRequestAuthorized(request: Request, config: CoworkConfig): boolean {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");
  if (isCoworkAccessAllowed(access)) return true;

  if (!config.cronSecret) {
    // No secret configured — only allow if we're not in production.
    return !needsAccessGate();
  }
  const auth = request.headers.get("authorization") || "";
  // Vercel cron sends `Bearer <CRON_SECRET>`.
  if (auth === `Bearer ${config.cronSecret}`) return true;
  return false;
}
