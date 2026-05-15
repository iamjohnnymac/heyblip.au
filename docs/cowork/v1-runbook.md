# Cowork v1 — operator runbook

Cowork v1 ([BDEV-510](https://heyblip.atlassian.net/browse/BDEV-510)) closes the **"PM dispatcher gap"** — Buddy can already coach on a ticket, but until now nothing autonomously filed *new* tickets when problems were discovered. v1 polls Sentry hourly and drafts a Jira ticket for each new issue. v2 (separate ticket) will add engineer-agent dispatch.

This doc is what John reads when enabling Cowork, when something looks off, or when rolling back.

---

## TL;DR

- Cowork lives entirely in `heyblip.au` (this repo). It does not touch `iamjohnnymac/heyblip`.
- Hourly Vercel cron hits `/api/cowork/run` and may file BDEV draft tickets carrying the `cowork-draft` label.
- The seven guardrails from BDEV-510 are enforced by `evaluateGuardrails()` in [`src/lib/cowork.ts`](../../src/lib/cowork.ts).
- Operator surface: [`/cowork/drafts?access=<MVP_CHECKLIST_ACCESS_KEY>`](/cowork/drafts) — list of drafts + audit log + "Run Cowork now" button.
- Default is **disabled**, **shadow mode**. Cowork will not file anything until you flip both `COWORK_ENABLED=true` and `COWORK_MODE=live`.

---

## Environment variables

Set these in Vercel project settings. Production and Preview should generally match; you can flip them independently while testing.

| Variable | Default | What it does |
| --- | --- | --- |
| `COWORK_ENABLED` | `false` | Kill switch. Cron exits immediately when false. |
| `COWORK_MODE` | `shadow` | `shadow` logs decisions but takes no Jira actions. `live` files drafts. |
| `COWORK_MAX_TICKETS_PER_HOUR` | `3` | Hard rate limit per UTC hour. |
| `COWORK_MAX_TICKETS_PER_DAY` | `15` | Hard rate limit per UTC day. |
| `COWORK_MAX_ANTHROPIC_TOKENS_PER_DAY` | `1000000` | Token-spend cap per UTC day. |
| `COWORK_CRON_SECRET` | unset | Optional bearer token for Vercel cron requests. Set the same value in `vercel.json` cron config (Vercel injects it automatically). |
| `COWORK_ANTHROPIC_MODEL` | `claude-haiku-4-5` | Used when calling Anthropic directly. |
| `COWORK_OPENROUTER_MODEL` | `anthropic/claude-haiku-4.5` | Used when calling via OpenRouter. |
| `SENTRY_AUTH_TOKEN` | (required) | Sentry personal/integration auth token with `event:read` and `project:read` on the `apple-ios` project. |
| `SENTRY_ORG` | `heyblip` | Sentry org slug. |
| `SENTRY_PROJECT` | `apple-ios` | Sentry project slug. |
| `ANTHROPIC_API_KEY` *or* `OPENROUTER_API_KEY` | (required for AI) | If neither is set, Cowork still files but uses a deterministic fallback description. |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | (already configured for Buddy) | Reused. |
| `MVP_CHECKLIST_ACCESS_KEY` | (already configured) | Reused for `/cowork/drafts` and `/api/cowork/*` access gates. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | (recommended) | Vercel KV. Counters, audit log ring buffer, Sentry cursor. Cowork still runs without KV but rate limits degrade to "in-memory per run" and audit log falls back to function logs. |

---

## The seven guardrails

| # | Guardrail | Where it lives |
| --- | --- | --- |
| 1 | Read-only shadow mode default | `readCoworkConfig()` defaults `mode` to `shadow`. Each `run` checks `config.mode === "shadow"` and emits a `would-file` audit entry instead of POSTing to Jira. |
| 2 | Hard rate limits | `evaluateGuardrails()` checks `filedThisHour`/`filedThisDay` against `COWORK_MAX_TICKETS_PER_HOUR/_PER_DAY`. KV-backed counters in `recordFiledTicket()`. |
| 3 | Token budget | Same evaluator, plus the per-issue loop in `/run` bails when `tokensSpentToday + tokensSpent > maxTokensPerDay`. |
| 4 | Idempotency | `searchExistingDraft()` runs a JQL search for `labels = "cowork-fingerprint-<hash>"` OR description text match before filing. The fingerprint is SHA1(Sentry issueId \| culprit \| first frame). |
| 5 | Tiered authority | The cron only writes via `createCoworkDraft()` (POST `/issue`) and `postJiraComment()`. Promote/reject only swap labels and comment — there are no transition calls. |
| 6 | Kill switch | `COWORK_ENABLED=false` → cron returns `status: "disabled"`, logs an audit entry, exits. |
| 7 | Audit log | `appendAuditLog()` writes a ring buffer to KV (last 200 entries, 30-day TTL). Every decision — file, would-file, dedup, error, guardrail-block, disabled — gets an entry. Also mirrored to `console.log` so Vercel function logs have it as a backup. |

---

## Phased rollout

Per BDEV-510:

### Phase 1 — Shadow (week 1)

```
COWORK_ENABLED=true
COWORK_MODE=shadow
```

Cowork runs the full pipeline but never POSTs to Jira. The audit log shows what it *would have* filed. **Daily check:** open `/cowork/drafts?access=…`, scan the audit log, ask "would I have filed each of these the same way?" If yes for ~5 consecutive days, proceed to Phase 2.

### Phase 2 — Assisted filing (week 2)

```
COWORK_ENABLED=true
COWORK_MODE=live
```

Cowork now files real BDEV drafts. They appear in the `/cowork/drafts` list. John (the operator) promotes good ones and rejects bad ones. Rejected drafts keep their fingerprint label so they won't be re-filed.

### Phase 3 — Auto-file (week 3)

No code change. Same as Phase 2; John just stops manually promoting. Currently this requires manual oversight — the auto-promotion-after-24h behavior is **not implemented in v1** (intentionally; it's a separate decision once trust is built). If Phase 3 needs auto-promote, file a follow-up ticket.

### Phase 4 — Add engineer-agent dispatcher

Cowork v2. Separate ticket.

---

## Enabling Cowork

1. In Vercel project settings, set the env vars listed above. At minimum: `SENTRY_AUTH_TOKEN`, `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`), `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Confirm `JIRA_*` and `MVP_CHECKLIST_ACCESS_KEY` are already set (Buddy uses them).
2. Set `COWORK_ENABLED=true`, leave `COWORK_MODE=shadow`.
3. Deploy. The cron will start firing on the hour.
4. Open `/cowork/drafts?access=<key>` and click **Run Cowork now** to trigger an immediate run without waiting for the cron.
5. Verify the audit log shows `would-file` entries with sensible summaries and Epic routing.
6. After Phase 1 sanity check (typically ~1 week), flip `COWORK_MODE=live`.

---

## Monitoring

### Operator dashboard

`/cowork/drafts?access=<key>` shows:
- Current config + counters (filed this hour/day, tokens spent today)
- All open drafts with Promote/Reject buttons
- Last 50 audit entries

### Vercel function logs

Every audit entry also `console.log`s with the `[cowork:run]` prefix, so you can `vercel logs` or use the dashboard log explorer to grep across runs.

### Jira

JQL queries you can save as filters:

- **Open drafts:** `project = BDEV AND labels = "cowork-draft" ORDER BY created DESC`
- **Promoted (last 7 days):** `project = BDEV AND labels = "cowork-promoted" AND created >= -7d`
- **Rejected:** `project = BDEV AND labels = "cowork-rejected"`
- **By fingerprint:** `project = BDEV AND labels = "cowork-fingerprint-<hash>"`

---

## Rolling back

### Stop Cowork immediately

Flip `COWORK_ENABLED=false` in Vercel. The next cron tick (within 60 min) will return `status: "disabled"`. To stop in-flight runs, redeploy after flipping the var.

### Drop back to shadow mode

Flip `COWORK_MODE=shadow`. The cron keeps running but stops filing.

### Un-file a draft Cowork posted

The audit log entry for a `filed` decision contains the Jira key, the fingerprint, and the Sentry issue URL. To roll back a single filed draft:

1. In Jira, comment on the ticket with the reason for rollback.
2. Transition it to Done (operator action — Cowork v1 has no transition authority).
3. Optionally remove the `cowork-fingerprint-<hash>` label so Cowork may re-file the same Sentry signal later if circumstances change. Leave the label in place if you want permanent suppression.

### Disable the cron without losing the route

Remove the `crons` entry from `vercel.json` and redeploy. The `/api/cowork/run` route remains callable manually with the access key.

---

## Reading the audit log

Each entry has the shape:

```json
{
  "ts": "2026-05-15T07:00:01.123Z",
  "decision": "would-file",
  "mode": "shadow",
  "reason": "shadow-mode",
  "sentryShortId": "APPLE-IOS-1A2",
  "sentryUrl": "https://heyblip.sentry.io/...",
  "fingerprint": "a1b2c3d4e5f6",
  "jiraKey": null,
  "tokensUsed": 412,
  "details": {
    "summary": "[SENTRY] NSInvalidArgumentException at ChatView.swift:142",
    "descriptionPreview": "## Headline …",
    "epic": "BDEV-386",
    "source": "anthropic"
  }
}
```

Decision values:

| Decision | Meaning |
| --- | --- |
| `filed` | Live mode wrote a draft to Jira. `jiraKey` is the new ticket. |
| `would-file` | Shadow mode — same decision, no Jira write. |
| `dedup` | Existing ticket carried the same fingerprint. `matchedKey` is the existing ticket. |
| `skipped` | Missing env var, Sentry fetch error, or similar setup failure. |
| `guardrail-block` | Rate limit / budget / kill switch tripped. `reason` names the guardrail. |
| `ai-error` | Anthropic/OpenRouter failed; Cowork fell back to the deterministic description. |
| `jira-error` | Jira API call failed. Look at `reason` for the Atlassian status string. |
| `no-new-events` | Sentry returned zero issues since the last cursor. |
| `disabled` | `COWORK_ENABLED=false`. |

---

## Acceptance check

Per BDEV-510 acceptance criteria, this implementation satisfies:

- [x] `src/app/api/cowork/run/route.ts` exists and runs hourly via `vercel.json` cron config.
- [x] All 7 guardrails implemented and gated by env vars.
- [x] Shadow mode is the default; `COWORK_ENABLED=false` is the default until manually flipped.
- [x] Idempotency: running the cron twice in a row never files duplicate tickets (fingerprint label + JQL dedup search).
- [x] Audit log shows every decision with reasoning.
- [x] `/cowork/drafts` surfaces `cowork-draft`-labelled tickets. (Buddy's `/queue` route still exists; the Cowork dashboard is its own surface so it stays orthogonal to whatever the `/queue` page eventually becomes when the Buddy branch merges.)
- [x] Promote and Reject buttons work on draft cards.
- [x] Documentation in `docs/cowork/v1-runbook.md` (this file).
- [ ] One end-to-end shadow run on Vercel preview before merge — see the PR description for the captured run.

---

## Known limitations / explicit non-goals

- **No transition authority.** Cowork v1 only writes drafts and comments. Promote/reject toggle labels but never call the Jira transitions endpoint. The operator transitions tickets manually.
- **No engineer-agent dispatch.** That's v2.
- **One signal source.** Sentry only. Buddy testers, TestFlight, and CI signals are out of scope until v2/v3.
- **Lossy Sentry cursor.** Cowork uses Sentry's `firstSeen:>` query as the cursor. If Sentry takes 10+ minutes to ingest an event, that event might be missed; on the next hour Cowork will see it via the `is:unresolved` fallback. This is acceptable for v1.
- **Epic routing is keyword-based.** `routeToEpic()` in `src/lib/cowork.ts` is a small regex catalogue. It defaults to Observability (BDEV-386) when nothing matches. The operator can re-parent a promoted ticket manually if the routing was wrong.
- **No Slack mirror.** Audit log lives in KV + Vercel logs. If you want a `#cowork-audit` channel, file a follow-up.
