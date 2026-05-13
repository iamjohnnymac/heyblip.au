# Buddy — PM Handover · 2026-05-13 (session 2)

You're picking up Buddy mid-stream, several hours after the original
2026-05-13 handover (`docs/buddy-pm-handover-2026-05-13.md`). This is the
second half of that day. Read that handover first for general context,
then this doc for what changed in this session.

John is the only operator — non-technical CEO, tests on his iPhone via
TestFlight, decides ship. Auto-mode is off; ask before doing anything
ambiguous. Plain English, no jargon, decisive answers.

## What shipped this session — 10 commits, all live on orcin

In chronological order on `improvements/test-buddy-clarity-and-coach-tighten`:

| Commit | Theme | One-liner |
|---|---|---|
| `a5bb8d0` | Visual cleanup | Classifier "Not required" → N/A; chip max-width with truncate (closed page-wide horizontal scroll bug); inline `<code>` `box-decoration-clone`; HTML-entity decode for `&amp;`; ISO date humanise; Debug-details grid 50/50 |
| `23a322b` | Classifier + stale copy | Headline pass beats later "blocked" in chip classification; dropped misleading "Private ticket details hidden" pill (sanitisation was already gone) |
| `a0645ee` | Five polish items | Content width 768 → 896px; duplicate "What to do on the phone" paragraph removed; queue SHA pills shortened (40 → 7 char); backtick markdown in step bodies → inline `<code>`; PR title scope reads `[TAG]` not workRecipe.kind |
| `c93dac7` | Concrete pass/fail | New `extractTestExpectations()` pulls "Pass if X / Fail if Y" from AI prose; Step 1 + Step 3 criteria; Step 1 renamed "Read what the AI tested" → "Here's what to test"; 4 new tests |
| `88d42c4` | Template guidance | Agent Test Update template + writing rules now require "Pass if X / Fail if Y" phrasing so the extractor stays fed |
| `79d7441` | Queue UX | Pill split: `Fix in build {SHA}` (green) vs `Plan only` (amber) — was previously one ambiguous "AI summary" pill on both fixed + plan-only tickets; chip renames: Ready for me → Ready for you, Backlog → Not started, Highest/High → Top priority; dropped "Has AI summary" filter |
| `0f776dc` | Field-audit follow-ups | `asNamed` parser fixed to handle multi-select arrays (queue surfaceList was empty for tickets with surfaces set); build/SHA split on Step 2 body (no more "Look for build build 65 / 5a1c2e1a83e9…"); live "Updated Xs ago" ticker on queue header |
| `3a3d9d6` | Step 4 file uploads | Drag-and-drop dropzone in FindingsPanel; new route `/api/mvp-ticket-checklist/findings-attachments` uploads to Jira; attachment URLs auto-fold into evidence; image thumbnails + chip per file; caps 10 MB/file, 30 MB/submit, image/text/JSON only |
| `67e8819` | Sonnet vision | Findings route fetches image attachments server-side (Jira auth, parallel, 6s per-image timeout), base64-inlines them into the Sonnet call as `image_url` content. Sonnet's system prompt updated to lead with image evidence over typed findings. Bumped FINDINGS_TIMEOUT_MS 15s → 45s; client overall 30s → 60s |
| `fab4362` | Reopen field reset | Tapping Reopen for fix now resets `Loop Stage = Failed/Reopened`, `Human Final Review = Failed`, and posts a new Agent Test Update comment with `Agent testing: failed` so all four `isReady()` conditions clear and the ticket actually drops out of Ready bucket |
| `bf28982` | Three follow-ups | Send-to-Codex prompt now includes latest Human Test Result + Sonnet verdict + concerns inline; Ask Buddy coach receives `latestHumanTestResult` field and is told to lead with what to change instead of generic step intros after a fail/inconclusive; new shared lib `src/lib/sentry-events.ts` + `/api/.../sentry-events` route + auto-inject of live Sentry counts into findings evidence (so Sonnet sees whether watched alerts dropped) |

Tests went from 23 → 47 in this stretch. All green. tsc + lint + build
clean across every commit.

## The mid-session Jira audit you may need to know about

Three parallel sub-agents walked every ticket in the queue:

- **14 Ready-for-you tickets** — 11 clean, 1 needs-attention (BDEV-365 is
  an App Store Connect manual-paste task, not a real "test"), 12 had a
  status-drift problem (status was `In Progress` but should have been
  `Verifying`). I bulk-transitioned all 12.

- **9 In Progress tickets** — 8 were stale Failed/Reopened; BDEV-251 got
  fields fixed by the sub-agent. None were ready to be promoted to
  Verifying. Two pairs share PRs (BDEV-250+BDEV-253 share failing PR #13;
  BDEV-360+BDEV-361 are docs that should resolve on a second dispatch).

- **27 Backlog tickets** — 11 dispatch-ready (BDEV-465 + BDEV-429 are
  launch-blockers worth doing first), 10 needs-human-triage, 6
  drift-fixed (BDEV-392, 393, 394, 395, 415, 492 — already fixed in
  code, just need Sentry verification + close, ~30-45 min of Sentry UI
  work).

Numbers as of this writing: 14 Ready, 9 In progress, 0 Waiting, 27 Not
started — same shape as before the audit, but the field state under each
ticket is now consistent and the queue logic reflects reality.

## Root-cause finding John needs to act on

The "PR merged → Verifying" Jira automation rule **only matches the
first `BDEV-N` in a multi-ticket PR title**. So PR #290 (`feat(launch):
App Store reviewer prep … (BDEV-359/362/360/361)`) and PR #293
(`chore(launch): … (BDEV-378, BDEV-353)`) transitioned at most one
ticket each, leaving the rest stuck.

**Fix path (admin-only — John must do this in Jira):**

1. Open <https://heyblip.atlassian.net/jira/settings/automation>
2. Find the existing "PR merged → Verifying" rule
3. Update the regex to match `BDEV-\d+` globally rather than the first
   occurrence
4. Or use Rovo: *"On PR merged, find every BDEV-N pattern in the title
   and transition each matched ticket to Verifying."*

Until that's done, multi-ticket PRs will keep drifting. The handover's
status-drift fallback (status=In Progress + `agentTestUpdateStatus === passed`
promoted to Ready) catches the symptom but doesn't fix the cause.

## Two other things John needs to do himself

1. **MVP Track has no `[WEB]` or `[LAUNCH]` option.** Sub-agent left
   those tracks blank on web/launch tickets — correct under the rules
   but ugly in the field. Add the options in Jira admin, or add a
   separate "Workstream" field.

2. **`Chat` Track option appears to be missing or named differently.**
   The sub-agent's `editJiraIssue` call rejected `Chat` as a value on
   BDEV-429. Confirm the actual option name (`Text DM`? `Chat List`?)
   or add `Chat` to the field.

## Critical Buddy parsers, in dependency order

Future agents touching these must run the test suite afterwards:

- **`scanComments`** in `src/lib/ticket-queue.ts:194` — walks every
  comment, takes the **most recent** Agent Test Update as the
  authoritative one. This was the source of the "12 tickets stuck at
  inconclusive" bug earlier today. Do NOT add a `break` back in.

- **`extractAgentTestUpdate`** in `src/lib/mvp-ticket-checklist.ts:1891` —
  the canonical comment parser. Reads `Agent testing:`, `Build/commit:`,
  surfaces, the `Human test requested:` block. Also calls
  `extractTestExpectations` to pull `Pass if X / Fail if Y` for the
  step-card criteria.

- **`extractTestExpectations`** in
  `src/lib/mvp-ticket-checklist.ts` — regex-based "Pass if … Fail if …"
  capture. Stops at the next pass/fail marker so they don't bleed into
  each other. Falls back to "" when phrasing isn't canonical.

- **`extractHumanTestResults`** in `src/lib/mvp-ticket-checklist.ts:1969` —
  parses every `Human Test Result` comment, returns newest-first. Drives
  the Past Test Results panel, the Send-to-Codex prompt's latest-verdict
  section (shipped today), and the coach's `latestHumanTestResult`
  payload field (shipped today).

- **`classifySurfaceResult`** in
  `src/app/mvp-ticket-checklist/_components/AgentTestSummary.tsx` — the
  4-state chip classifier. Position-aware: when both pass and fail
  signals appear, the earlier one wins. Edge: "Not required" → N/A.

## The Reopen-for-fix invariant

If you change Buddy's queue `isReady()` logic, remember that **Reopen
for fix must result in all four conditions returning false**. Today
they are:

1. `status === "verifying"`
2. `humanFinalReview === "ready"`
3. `loopStage` matches `verifying|in build|ci green`
4. `status === "in progress"` AND `agentTestUpdateStatus === "passed"`

The transition route's reopen path (`src/app/api/mvp-ticket-checklist/transition/route.ts`)
resets each of these explicitly:

- Transition flips (1)
- `editJiraIssueFields` writes Loop Stage = Failed/Reopened (3)
- `editJiraIssueFields` writes Human Final Review = Failed (2)
- The override "Agent Test Update — Reopened" comment uses
  `Agent testing: failed` so `scanComments` flips (4)

All four are best-effort — if any single write fails, we log + continue.
The status transition is the only required write.

## Env vars Buddy now expects

On Vercel (`heyblip.au` project, `team_BIY0o5dvaBb15JdKNSrFl6W6`):

| Var | Required? | Used by |
|---|---|---|
| `JIRA_BASE_URL` | yes | Everything — Jira REST |
| `JIRA_EMAIL` | yes | Same |
| `JIRA_API_TOKEN` | yes | Same |
| `MVP_CHECKLIST_ACCESS_KEY` | yes in prod | Per-request access gate |
| `OPENROUTER_API_KEY` | for Sonnet verdicts | findings + coach routes; fall back to deterministic local verdict when missing |
| `OPENROUTER_FINDINGS_MODEL` | optional | overrides `anthropic/claude-sonnet-4.6` |
| `NEXT_PUBLIC_SITE_URL` | optional | OpenRouter `HTTP-Referer` header |
| **`SENTRY_AUTH_TOKEN`** | **new this session, optional** | Sentry auto-pull (lib/sentry-events.ts). When unset, the route returns `status=disabled` and the findings flow falls back to text-only evidence |
| **`SENTRY_ORG_SLUG`** | **new, optional** | Sentry org (e.g. `heyblip`) |
| `SENTRY_PROJECT_SLUG` | optional | Default `apple-ios` |
| `SENTRY_API_BASE` | optional | Default `https://us.sentry.io/api/0` |

To enable Sentry auto-pull: in the Vercel dashboard, project Settings →
Environment Variables, add `SENTRY_AUTH_TOKEN` (Internal Integration
token with `event:read` + `issue:read`) and `SENTRY_ORG_SLUG=heyblip`.
Then redeploy — `npx vercel deploy --prod --yes`. The findings route
will start auto-injecting live Sentry status into Sonnet's evidence the
next time a user submits findings on a ticket whose AI plan flagged
Sentry IDs.

## Hard rules (unchanged from earlier handover, but reinforced)

1. **Plain English, no jargon.** John is non-technical. "agent" → "AI",
   "Agent Test Update" → "the AI's summary in Jira", etc. The
   `scrubJargon` post-processor in the coach route catches the regex-able
   ones but the system prompt does most of the work.

2. **One thing on the page.** Every commit this session that added a
   feature also removed or simplified something to keep visual density
   down (the "Fix in build" pill replaced two separate pills; the
   `latestHumanTestResult` in the coach replaced generic step
   explanations, not added a new field on top).

3. **Honest UI states.** The 4-state chip classifier shipped earlier
   today is the canonical example. Don't say "passed" when status is
   "blocked"; don't say "ready" when the data says otherwise.

4. **John merges PRs.** Engineer-agents stop at branch pushed + PR
   opened + #blip-dev notification. Per-instance authorisation only.

5. **Per-instance deploy authorisation.** `vercel deploy --prod --yes`
   is gated. "Yes deploy" is enough; vague "you can do it from here?"
   is not. John was decisive about it this session — when he says fix
   it / ship it, do both.

6. **Don't auto-Generate AI Summary in bulk** without per-instance
   authorisation. The button on each card is fine for one-off use.

7. **Atlassian rate limits are aggressive** and show as 401/404 (not
   429). Sleep ≥1s between writes, ≥5s on backoff.

## What's queued / pending / explicitly open

### Code follow-ups not shipped yet

- **Detail-page live Sentry panel** — the GET route exists but the
  detail page doesn't yet fetch + render counts inline. The "What to
  watch in Sentry" panel still shows just the static ID list. ~20 LOC
  client-side fetch + a small chip-row component.

- **Pass-criteria comment for the Mark Done path** — symmetric to the
  Reopen flow, Mark Done could also reset fields if needed. Currently
  Mark Done just transitions status → Done and posts a verification
  comment. No-action-needed for now since Done is terminal.

### Open issues John specifically flagged this session

- **Daily Slack digest at 9am** ("8 tickets in your queue, top one is
  BDEV-486") — cron + Slack webhook, ~1 hour to build. Not started.

- **Mobile `/next` route** that picks the top queue item and redirects
  — ~30 min, not started.

- **Buddy explains the #1 pick** with a Haiku-rewritten reason —
  ranker reasons currently render as machine bullets, ~30 min, not
  started.

### From the older 2026-05-08 handover (still open)

- `GITHUB_TOKEN` → swap John's `gho_*` session token for a
  fine-grained PAT scoped `Actions: read-only` on `iamjohnnymac/heyblip`
- 20-min Apple-processing heuristic — wire to ASC API using existing
  `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_PRIVATE_KEY` secrets
- 20s in-memory cache in `build-status/route.ts` doesn't survive
  serverless cold starts — KV when Pro plan lands
- Vercel KV / collision indicator (Pro plan blocker)
- `dSYM` warning on TestFlight builds — fix in archive step
- Node 20 deprecation warning in `deploy-testflight.yml`

### Open user-action items

- **Rotate Vercel token** `vcp_2wdlx11BFSHm…` — flagged in the
  2026-05-13 (session 1) handover, still pending.
- **Delete BDEV-352 and BDEV-252 E2E test comments** — cosmetic,
  Atlassian MCP doesn't expose a delete-comment tool from this box.
- **Fix the "PR merged → Verifying" automation rule** to handle
  multi-ticket PR titles (root cause of the 12-ticket drift this
  session — see above).
- **Add MVP Track options** for `[WEB]` and `[LAUNCH]` (or add a
  separate Workstream field).
- **Confirm Chat track name** in Jira admin.

## How to talk to John (unchanged from prior handover, still right)

- Direct, not formal. CEO; reads fast.
- Honest about gaps. "This doesn't work yet because X" beats "I think
  this might work, let me try."
- Push back when you disagree. He proposed Haiku for the verdict route
  earlier in the project; the prior agent pushed back on Sonnet being
  right for binary shipping decisions and he agreed. Sycophancy wastes
  his time.
- Show him the screen, not the code. He doesn't read source.
- Translate AI output for him on the spot. Don't make him decode
  dev-speak.

## File map for the things touched this session

```
src/
├── app/
│   ├── api/
│   │   └── mvp-ticket-checklist/
│   │       ├── findings/route.ts             — Sonnet vision + Sentry auto-inject
│   │       ├── findings-attachments/route.ts — Jira upload (new this session)
│   │       ├── sentry-events/route.ts        — GET live Sentry snapshot (new)
│   │       ├── transition/route.ts           — reopen field reset (new)
│   │       └── coach/route.ts                — latestHumanTestResult payload
│   ├── mvp-ticket-checklist/
│   │   ├── MvpTicketChecklistClient.tsx      — file upload state + plumbing
│   │   └── _components/
│   │       ├── AgentTestSummary.tsx          — classifier headline-pass; chip width
│   │       ├── FindingsPanel.tsx             — attachment dropzone + previews
│   │       ├── FocusCard.tsx                 — InlineMarkdown subtitle
│   │       ├── SmallComponents.tsx           — InlineMarkdown + HTML decode
│   │       └── shared.ts                     — buildInstallLabel, buildProofSha,
│   │                                            decodeHtmlEntities, humaniseTimestamps
│   └── queue/
│       ├── QueueClient.tsx                   — chip renames + "Updated Xs ago"
│       └── QueueCard.tsx                     — Fix in build / Plan only pill split
└── lib/
    ├── mvp-ticket-checklist.ts               — extractTestExpectations,
    │                                            editJiraIssueFields, agent prompt
    │                                            with latest verdict
    ├── ticket-queue.ts                       — most-recent ATU wins + asNamed for arrays
    ├── sentry-events.ts                      — shared Sentry fetcher (new)
    └── findings-verdict.ts                   — image-aware system prompt
```

## Where things live (unchanged)

- **App repo:** `https://github.com/iamjohnnymac/heyblip` (iOS)
- **Buddy repo:** `https://github.com/iamjohnnymac/heyblip.au`, branch
  `improvements/test-buddy-clarity-and-coach-tighten`
- **Buddy live:** `https://heyblipau-orcin.vercel.app` (auto-deploys on
  push are flaky; use `npx vercel deploy --prod --yes` from the
  fork-clone after John has run `vercel login`)
- **Local clone:** `C:\Users\john_\OneDrive\Documents\Claude\Projects\heyblip\heyblip-au-fork-clone`
- **Jira:** `https://heyblip.atlassian.net`, project `BDEV`
- **Slack workspace:** `the-mesh-group.slack.com`, `#blip-dev` for
  status, `#jmac-tasks` / `#tay-tasks` for dispatches

## Verification commands (run after any change)

```bash
cd C:/Users/john_/OneDrive/Documents/Claude/Projects/heyblip/heyblip-au-fork-clone

npx tsc --noEmit                                       # MUST pass clean
node --test src/lib/mvp-ticket-checklist.test.mjs \
            src/lib/findings-verdict.test.mjs \
            src/lib/ticket-queue.test.mjs \
            src/lib/build-status-match.test.mjs \
            src/lib/generate-summary-prompt.test.mjs    # 47 tests, all green
npm run lint                                            # one pre-existing
                                                        # _NODE_R_BASE warning
                                                        # is fine
npm run build                                           # MUST succeed

# When ready to ship (John must have run `vercel login` once first):
npx vercel deploy --prod --yes
```

## Today's last test run for BDEV-407

John tested BDEV-407 (push diagnostic), saw 5 concerns from Sonnet,
tapped Reopen for fix. The transition fired but BDEV-407 stayed in the
Ready bucket because the supporting fields weren't reset.

**I fixed it manually:**
- `customfield_10046` Human Final Review: `Ready → Failed`
- `customfield_10044` MVP Loop Stage: `Human Verifying → Failed/Reopened`
- Posted a new Agent Test Update comment with `Agent testing: failed`
  so `scanComments` flips agentTestUpdateStatus from "passed" to "failed"

**Then I shipped the permanent fix** (`fab4362`) so future Reopens do
all three automatically.

If you see another ticket stuck in Ready after a Reopen, run the same
three writes manually — or check whether the deploy of `fab4362`
actually landed before the user tried it. The full URL of the
post-deploy build is in the commit's deploy log.

Standing by.
