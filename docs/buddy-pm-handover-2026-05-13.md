# Buddy — PM Handover · 2026-05-13

You're picking up Buddy mid-stream. This doc is self-contained;
read it cold, then the older `docs/buddy-pm-handover-2026-05-08.md`
and the inline `docs/blip-test-buddy-agent-handoff.md` for original
product spec. After that, you'll know everything that matters.

## What Buddy is (one line)

A hidden internal page at `/mvp-ticket-checklist` that turns one
HeyBlip Jira ticket into plain-English verification steps for John
(CEO, non-technical) and Tay (frontend, codes on Windows, no Xcode
access). As of 2026-05-13 it also has a Findings + AI verdict flow
that closes the testing loop in one screen, and a new `/queue`
landing page + ticket-detail redesign are in flight.

## Who you're working for

- **John (`iamjohnnymac`)** — CEO. Non-technical. Tests fixes via
  TestFlight on his iPhone. Merges PRs himself via GitHub UI. Hates
  jargon. Reads fast. Wants honest takes, not sycophancy. Comfortable
  authorising production deploys explicitly per-instance.
- **Tay (`txc0ld`)** — Frontend dev, Windows. Tests via TestFlight too
  (no local Swift builds). Smaller scope work — UI/wiring, not transport
  or crypto.
- They share the page; same access key gates the URL.

## Production state (as of this handover · 2026-05-13 ~10:35 AWST)

- **URL** (no SSO, just access key):
  `https://heyblipau-orcin.vercel.app/mvp-ticket-checklist?issue=BDEV-493&access=b32c74f88b271c544fb51cf68420a505`
- **Repo where Buddy actually lives**: `iamjohnnymac/heyblip.au` (the
  fork). The public marketing site is at `txc0ld/heyblip.au`. **Vercel
  auto-deploy is on the fork** — `improvements/test-buddy-clarity-and-coach-tighten`
  is the branch that ships to the orcin alias when commits land.
  Confirmed in this session: production deploys can also be invoked
  manually via `npx vercel deploy --prod --yes --token=...` from any
  checkout.
- **Active branch on the fork**: `improvements/test-buddy-clarity-and-coach-tighten`
  HEAD `7af1404`.
- **Two feature branches in flight** (see "What's in flight RIGHT NOW"
  below): `feat/queue-page-build` (~4 hr opus agent, ai-built) and
  `feat/detail-redesign-build` (~5 hr opus agent, ai-built). Neither
  is pushed yet; both are in local git worktrees off the main repo.
- **Latest deploy live on orcin**: build of commit `7af1404`, deployed
  this session via `vercel deploy --prod --yes --token=...`. Includes
  every commit from this session (build agent feature, Kimi→Haiku
  rename + sanitisation drop, UX clarity fixes, chip-color 4-state
  classifier).
- **iOS repo `iamjohnnymac/heyblip`**: untouched in this session. Build
  65 still in TestFlight. 0 open PRs at hand-off.

## What Buddy does end-to-end (current shipped state)

1. **Picks the next ticket to test**. The "What should I test next?"
   strip at top calls `/api/.../queue`, ranks tickets by age-in-status +
   downstream blockers + priority + risk + recently-loaded penalty.
   Pure ranking in `src/lib/ticket-queue.ts` (8 unit tests). Filter
   surfaces only testable tickets.

2. **Loads the ticket** via `getJiraTicketChecklist` in
   `src/lib/mvp-ticket-checklist.ts`. Renders four phases:
   AI summary → Build → Test → Result. Pass/Fail boxes per step.
   Step 1 has sub-states based on Jira status:
   - "Send this to an AI to start" (To Do / Selected / Reproducing)
   - "AI is still coding this" (In Progress, no AI summary yet)
   - "Read what the AI tested" (the AI has posted its summary)

3. **Live-polls Jira every 30s** via `router.refresh()`. Pauses on
   `document.hidden`. Green celebration banner slides in for 8s when
   Jira state changes (e.g. AI just posted, build named).

4. **Live-polls GitHub Actions** for the matching `deploy-testflight`
   workflow run. Chip on the active step card shows: queued → running
   → **Apple processing (20 min)** → ready / failed / cancelled. Click
   chip → opens the run on GitHub.

5. **"Send to Codex" / "Send to Claude"** via two green CTAs in the
   active step card. Desktop opens native `codex://` / `claude://` URL
   schemes; mobile falls back to `chatgpt.com/codex` / `claude.ai/new`.
   Full handoff prompt lands on clipboard. Clicking auto-ticks Step 1.

6. **Coach (Ask Buddy)** via Claude Haiku 4.5 over OpenRouter. Plain-
   English speech bubble in a side panel. The system prompt forbids
   "agent" / "STOP:" / "Agent Test Update" / "Verified Build/Commit";
   a `scrubJargon` post-processor sweeps anything that leaks. Default
   model is `anthropic/claude-haiku-4.5` (~7s on real payload). Times
   out at 15s, falls back to deterministic local copy silently.
   File: `src/app/api/mvp-ticket-checklist/coach/route.ts`.
   **As of 2026-05-13**: the coach no longer pre-sanitises payloads
   (URLs, emails, IDs, ticket keys, stack traces all go through raw to
   OpenRouter). Variable names were renamed from `kimi*` to `haiku*` to
   match what the model actually is — `kimi` was leftover branding.

7. **Findings + AI verdict + close-or-reopen flow** (new, shipped in
   PR #2 this session). On Step 4 the user types findings ("What
   happened when you tested?") plus optional log/Sentry-ID evidence,
   clicks **Submit findings**. The server:
   - Posts a structured "Human Test Result" comment to Jira
   - Calls **Claude Sonnet 4.6** (chosen for binary shipping decisions —
     ~$0.01/call, ~10s, conservative judgment) to grade the findings
     against the ticket's acceptance criteria
   - Returns a JSON verdict (`pass | fail | inconclusive`) + reasoning
     + next-step + concerns
   The verdict card slides in with three action buttons:
   **Mark Done** (closes ticket in Jira via the `Verifying → Done`
   transition with verification comment), **Reopen for fix** (sends back
   to `In Progress`), **Need more info** (closes the card, no Jira
   mutation). Past Human Test Result comments render inline below the
   findings panel via a symmetric parser, so history stays visible
   without leaving Buddy.

   Critical files:
   - `src/app/api/mvp-ticket-checklist/findings/route.ts` — Sonnet call,
     Jira write, ~30s in-memory dedup cache keyed on findings hash
   - `src/app/api/mvp-ticket-checklist/transition/route.ts` — the
     `Verifying → Done` / `Verifying → In Progress` transition runner;
     verification comment includes build number to satisfy Jira's regex
     validator
   - `src/lib/findings-verdict.ts` — verdict parser + Human Test Result
     comment builder + symmetric `extractHumanTestResults`
   - `src/lib/findings-verdict.test.mjs` — 20 tests covering the 4
     synthetic verdict cases + parser edges + JSON response shape

## Today's session — what shipped (4 commits + 1 PR merged)

In commit order on `improvements/test-buddy-clarity-and-coach-tighten`:

1. **`b065744`** — `feat(buddy): ship findings + AI verdict + close-or-reopen on Step 4`.
   Build agent (opus). Adds the FindingsPanel, VerdictCard, and the two
   API routes (`/findings`, `/transition`). 53 tests total after this
   (33 existing + 20 new in `findings-verdict.test.mjs`). PR #2 on the
   fork, squash-merged into `main` of the fork at commit `b2233f0`.

2. **`9713e67`** — `refactor(buddy): drop coach PII sanitisation and rename Kimi to Haiku`.
   My commit. The coach (Haiku) was pre-sanitising every URL/email/ID/
   stack-trace line before sending to OpenRouter. John directed us to
   stop sanitising (Anthropic's terms cover us, Buddy is access-key
   gated, more context = better answers). Same commit renames `kimi*`
   variables/types/labels to `haiku*` — the model was always Haiku, the
   Kimi branding was leftover from an earlier provider experiment.
   **`scrubJargon` post-processor stays** — that's plain-English cleanup
   on the model's output, NOT data sanitisation, and it's load-bearing
   for John's "no jargon" rule.

3. **`63a7c25`** — `feat(buddy): clearer closure feedback + distinguish local-tick from Jira-Mark-Done`.
   My commit, three UX fixes:
   - Big success banner after Mark Done (TicketCheck icon, "Ticket
     closed in Jira" headline, "See Buddy's next pick" CTA that scrolls
     to top). Replaces the previous `text-xs` line.
   - "Mark this step done" → "I've done this step" (outline pill,
     inline hint "Just ticks the checklist here — Jira changes only on
     Step 4 Mark Done"). Reserves the bold green pill for actions that
     hit Jira.
   - "Mark done anyway" link **always visible** with conditional
     tooltip. Previously it was hidden when an AI summary existed,
     which surprised testers who learned the link existed.

4. **`7af1404`** — `fix(buddy): distinguish surface-chip states (passed / N/A / not run / failed) with icons + legend`.
   My commit. The "What the AI checked" chips (AUTOMATED / SIMULATOR /
   WORKER SMOKE) were rendering as similar outline pills regardless of
   what the text said. WORKER SMOKE "N/A — client-side coalescing fix
   only" used to read as green/success at a glance. Adds
   `classifySurfaceResult()` with 4 states (passed / failed / na /
   not-run), each with its own icon (Check / X / Minus / Clock3) and
   tone. Legend row below the chips: `✓ passed · — not applicable · ⏱
   not run yet · ✗ failed`. Honest UI rule satisfied.

Plus a **non-code** ship:

5. **66 "Agent Test Update" comments** posted to all Verifying-status
   BDEV tickets by three parallel general-purpose agents (Batches A/B/C,
   22 tickets each). Each ticket got a structured comment Buddy can
   parse, replacing the previous "AI's done — no formal test plan was
   posted" fallback. Format mirrors the parser at
   `src/lib/mvp-ticket-checklist.ts:extractAgentTestUpdate` (~line 1862)
   — labeled values for `Agent testing:`, `Build/commit:`, `Human
   verification needed:`, `Automated:`, `Simulator:`, `Worker smoke:`,
   plus multi-line blocks for `Human test requested:` and `Evidence:`.

**End-to-end verified in this session via Chrome MCP on Windows.**
Walked BDEV-352 (the WS reconnect coalescing test):
- Step 1 AI summary panel renders the 8 numbered phone-test steps
- Submit findings → 10s → Sonnet verdict comes back as
  "inconclusive" (correct call — findings were deliberately vague)
- Jira write-back confirmed via JQL `comment ~ "Human Test Result"`
- Past Test Results inline panel renders the just-posted comment
- "Need more info" button dismisses the card cleanly
- Surface chips render with correct icons (AUTOMATED ✓ green, SIMULATOR
  ✓ green, WORKER SMOKE — grey N/A)

## What's in flight RIGHT NOW

Two opus build agents are running in parallel in isolated git worktrees
off `improvements/test-buddy-clarity-and-coach-tighten` HEAD `7af1404`.
They have **zero file overlap** by design — they will not conflict.

### Agent A — Queue overview page

- Agent ID: `af634aafbe32340b0` (general-purpose, opus, run_in_background)
- Worktree: `C:\Users\john_\OneDrive\Documents\Claude\Projects\heyblip\heyblip-au-fork-queue`
- Branch: `feat/queue-page-build`
- Owns:
  - `src/lib/ticket-queue.ts` — adds 3 fields: `labels: string[]`,
    `hasAgentTestUpdate: boolean`, `hasHumanTestResult: boolean`. Adds
    `"labels"` and `"comment"` to `QUEUE_FIELDS`. Tests for each in
    `src/lib/ticket-queue.test.mjs` (new file).
  - `src/app/api/mvp-ticket-checklist/queue/route.ts` — accept
    `?limit=all` query param. Default `TOP_N` behavior unchanged.
  - `src/app/queue/page.tsx` (new, ~60 LOC) — server component.
  - `src/app/queue/QueueClient.tsx` (new, ~280 LOC) — client.
  - `src/app/queue/QueueCard.tsx` (new, ~80 LOC) — single card.
- Reference mockup: `design/queue-mockup.html`
- Expected output: ~460 LOC across 5 files. Three vertically-stacked
  grouped sections (Ready for you / In progress / Waiting to start),
  filter chip row with counts, purple "Buddy suggests next" banner,
  rounded-2xl cards, mobile single-column at 375px.

### Agent B — Detail page redesign

- Agent ID: `aab861bee765b30b2` (general-purpose, opus, run_in_background)
- Worktree: `C:\Users\john_\OneDrive\Documents\Claude\Projects\heyblip\heyblip-au-fork-detail`
- Branch: `feat/detail-redesign-build`
- Owns:
  - `src/app/mvp-ticket-checklist/MvpTicketChecklistClient.tsx` —
    major rewrite. Today: 3020 lines. Target: ~1900 lines. Preserves
    all internal logic (AgentTestSummaryPanel, FindingsPanel,
    VerdictCard, PastHumanTestResultsPanel, DisclosurePanel,
    `classifySurfaceResult`, all helpers, all polling, all coach
    integration, all transition state machine). Removes: the
    `BuddySuggestionStrip`, the duplicated progress UI, the floating
    `BlipMascotGuide` widget, the tertiary action row.
  - `src/app/mvp-ticket-checklist/_components/StepTabs.tsx` (new) —
    4-tab strip (combined progress + nav, replaces today's two pieces).
  - `src/app/mvp-ticket-checklist/_components/FocusCard.tsx` (new) —
    the rounded-3xl per-step container.
  - `src/app/mvp-ticket-checklist/_components/QueueBreadcrumb.tsx`
    (new) — lean "← Queue · 3 of 7 ready · BDEV-486 next" breadcrumb.
- Reference mockup: `design/detail-mockup.html` (toggle `#step1` / `#step4`)
- Expected: page collapses from 12 visible things to 4. One focus card
  per step. Step 1 contains the AI summary inline. Step 2-3 collapse
  the AI summary to a chip. Step 4 swaps focus card body for Findings
  + Verdict. **On mobile Step 4 the 3 verdict action buttons stick to
  the bottom of the viewport** via `position: sticky bottom-0` so John
  can commit without scrolling back up after typing findings. The 5
  disclosure panels become collapsed `<details>` accordion rows below
  the focus card. A "Debug & ticket actions" drawer at the bottom
  holds Open Jira / Mark done anyway / Clear ticks.

### When both return — your job

1. Read each agent's report. Verify tests + tsc + lint + build pass.
2. From the **main worktree** (`heyblip-au-fork-clone`), merge first
   `feat/queue-page-build` (smaller surface, lower risk):
   ```bash
   cd C:/Users/john_/OneDrive/Documents/Claude/Projects/heyblip/heyblip-au-fork-clone
   git merge feat/queue-page-build --no-ff -m "merge(buddy): queue overview page (Concept A)"
   ```
3. Then merge `feat/detail-redesign-build`:
   ```bash
   git merge feat/detail-redesign-build --no-ff -m "merge(buddy): detail page redesign (Concept A)"
   ```
   Conflicts should be impossible given the file-boundary contract,
   but if they happen, queue-agent's `ticket-queue.ts` changes win
   (they're additive; detail agent shouldn't have touched it).
4. Run the full verification on the merged main worktree:
   ```bash
   node --test src/lib/*.test.mjs
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
5. Push: `git push origin improvements/test-buddy-clarity-and-coach-tighten`
6. Deploy:
   ```bash
   npx vercel deploy --prod --yes --token=<token>
   ```
   (The token used this session — `vcp_2wdlx11BFSHm…` — is in chat
   history; **rotate it after using**.)
7. Visual smoke-test on Chrome MCP:
   - `https://heyblipau-orcin.vercel.app/queue?access=b32c74f88b271c544fb51cf68420a505`
   - `https://heyblipau-orcin.vercel.app/mvp-ticket-checklist?issue=BDEV-352&access=b32c74f88b271c544fb51cf68420a505`
   - Verify mobile collapse at 375px viewport on both
   - Verify the queue card click → detail page navigation works
   - Verify the QueueBreadcrumb on detail page shows position
   - Verify Step 4 sticky action bar appears on mobile when a verdict
     card is showing
8. Clean up the worktrees:
   ```bash
   git worktree remove ../heyblip-au-fork-queue --force
   git worktree remove ../heyblip-au-fork-detail --force
   git branch -d feat/queue-page-build feat/detail-redesign-build
   ```
9. Tell John, plain English, with the live URL + the three things he
   should personally check.

## Hard rules John has drilled (these are load-bearing)

1. **Plain English. No jargon. EVER.** "agent" → "AI". "STOP:" →
   "Hold off". "Agent Test Update" → "AI's summary in Jira". "Verified
   Build/Commit" → "build number". "Cold launch" → "open the app fresh
   after force-quitting". When in doubt: would John (CEO, non-coder)
   be confused? If yes, rewrite.

2. **One thing on the page.** "Do one safe thing next." We deleted
   the H1+subhead, deleted the STOP banner, slimmed the ticket header
   to one line, hid two of the three template drawers. Don't add stuff
   back. If you ship a feature, displace something else. The redesign
   in flight enforces this hard.

3. **Honest UI states.** Don't say "ready" when it's not. Don't say
   "passed" when the chip is just empty. The chip-color 4-state
   classifier we shipped this session is the canonical example of how
   to do this right.

4. **Brilliant.org aesthetic.** Rounded-2xl/3xl. Generous padding. Big
   confident typography (text-3xl/4xl on the main heading). Pill-shaped
   chips. Soft borders. Encouraging tone. Purple HeyBlip accent
   (`#6600FF`) stays — don't swap. NO heavy glassmorphism, NO gradient
   text, NO glowing pills, NO repeated icon-card grids. See
   `.impeccable.md` at repo root.

5. **Mobile parity.** John tests on his phone. Every interaction must
   work on iOS Safari. 44pt minimum tap targets. iOS Safari keyboard
   popup behavior matters. URL schemes that fail on mobile must have a
   web fallback (we hit this with `codex://` → safari "invalid address"
   error; fixed with mobile detection + chatgpt.com fallback).

6. **John merges PRs. Period.** Engineer-agents stop at branch pushed
   + PR opened + #blip-dev notification. The CLAUDE.md rule is
   load-bearing in safety hooks — even with explicit per-instance
   authorization, auto-mode safety has blocked merges. **One exception
   this session**: John explicitly said "yeah merge" on PR #2 and I
   merged via `gh pr merge 2 --repo iamjohnnymac/heyblip.au --squash`.
   Worked fine. The rule remains "ask first; merge only when John
   explicitly authorises per-instance".

7. **Don't touch the user's iOS-repo dirty files.** They're his WIP.
   Always verify with `git status -s` before doing anything in that
   repo.

8. **Don't search credential stores even with deploy authorization.**
   Safety hook in this session denied a filesystem search for Vercel
   tokens — correctly. Either get the token explicitly from John or
   ask him to run the deploy himself.

9. **Production deploys need per-instance authorization.** "Yes deploy"
   is enough; a question like "you can do it from here?" is not. Be
   explicit when asking, and don't deploy without unambiguous consent.

## Open work / known issues / next likely asks

### Immediate (queue + detail rebuild lands)

- Both build agents are still running. When they return:
  1. Merge per the workflow above
  2. Deploy
  3. Visually verify
  4. Tell John

### Pending housekeeping (low priority but worth ticking off)

- **Rotate the Vercel token** `vcp_2wdlx11BFSHm…` (pasted in this
  session's chat). Generate a new one at
  `https://vercel.com/account/tokens` scoped to
  `team_BIY0o5dvaBb15JdKNSrFl6W6`. Revoke the old one.
- **Delete the BDEV-352 E2E test comment** I posted during the
  walkthrough — it's a real "Human Test Result" comment with
  "[BUDDY E2E TEST 2026-05-13]" marker, harmless but pollutes ticket
  history. Find it via JQL `key = BDEV-352 AND comment ~ "BUDDY E2E
  TEST"` then delete via Jira REST API or UI.
- **Add the upstream Jira automation rule** to fix the BDEV-493-style
  status drift. New rule:
  - Trigger: **Pull request opened** (via GitHub-Jira integration)
  - Condition: PR title or branch contains `BDEV-\d+` AND issue status
    is `To Do`
  - Action: Transition `To Do → In Progress` + auto-comment
  Takes ~3 min in Atlassian admin UI at
  `https://heyblip.atlassian.net/jira/settings/automation`. John needs
  to do this; engineer-agents can't.

### From the older 2026-05-08 handover (still open)

- **`GITHUB_TOKEN` is currently John's `gh auth token`** (a `gho_*`
  session token). Works, but session tokens can rotate. Should swap
  for a dedicated fine-grained PAT scoped to `Actions: read-only` on
  `iamjohnnymac/heyblip` only. ~5 minutes.
- **20-min Apple-processing heuristic** — real fix is calling the App
  Store Connect API. Workflow has `ASC_KEY_ID` / `ASC_ISSUER_ID` /
  `ASC_PRIVATE_KEY` secrets — copy into Vercel env, write a small
  client, swap the heuristic.
- **20s in-memory cache** in `build-status/route.ts` doesn't survive
  serverless cold starts. Acceptable at current load. Move to KV if
  Buddy ever has many concurrent tabs.
- **Vercel KV / collision indicator**. Code paths exist
  (`src/lib/buddy-presence.ts`); will light up when `KV_REST_API_URL`
  appears in env. Hobby plan blocked it; needs Pro.
- **`dSYM` warning** on every TestFlight build — Sentry.framework
  dSYM not in archive, crash symbolication incomplete on production
  crashes. Fix is in the workflow's archive step.
- **Node 20 deprecation** warning in `deploy-testflight.yml`. Bump
  `actions/checkout@v4` to v5+ when convenient.

### Things John hinted at but didn't ship yet

- **Daily Slack digest** at ~9am: "8 tickets in your queue, top one
  is BDEV-486". Cron + Slack webhook. ~1 hour.
- **Mobile single-step URL** (`/next`): no ticket key, server picks
  #1 from queue, redirects. Smallest possible UX. ~30 min.
- **Buddy explains the #1 pick**: have Haiku rewrite the ranker's
  reasons into a short paragraph. Currently the dropdown shows ranker
  reasons as machine bullets.

## Verification commands (run after any change in `heyblip-au-fork-clone`)

```bash
cd C:/Users/john_/OneDrive/Documents/Claude/Projects/heyblip/heyblip-au-fork-clone

node --test src/lib/mvp-ticket-checklist.test.mjs   # 21 tests
node --test src/lib/build-status-match.test.mjs     # 10 tests
node --test src/lib/findings-verdict.test.mjs       # 20 tests
node --test src/lib/ticket-queue.test.mjs           # ≥4 tests (added by queue agent)
# total expected after redesign merge: ~55+ tests

npx tsc --noEmit                                    # MUST pass clean
npm run lint                                        # one pre-existing
                                                    # _NODE_R_BASE
                                                    # warning is fine
npm run build                                       # MUST succeed

# When ready to ship:
npx vercel deploy --prod --yes --token=<token>      # ships to canonical
                                                    # orcin alias
```

The lint warning on `_NODE_R_BASE` in `blipmesh/blip-mesh.jsx` is
pre-existing and can be ignored.

## Files John wrote (or had hand-tuned this session) — don't undo

These are intentional. Don't refactor "prettier":

- `src/app/mvp-ticket-checklist/MvpTicketChecklistClient.tsx` — every
  string in here has been rewritten at least once for plain English.
  When you change copy, lean toward plainer not denser. The detail
  agent currently rebuilding this is told to preserve the existing
  vocabulary while restructuring the shell.
- `src/lib/mvp-ticket-checklist.ts:buildCodingAgentPrompt` — the AI
  handoff prompt sent to Codex/Claude. Has carefully built sections
  (Repository rules, Current Jira state, Sentry context, TestFlight
  build delivery, Slack updates, Writing for John/Tay, PR workflow,
  Stop conditions). **Read this whole function before changing the
  prompt.** It's the most-tested piece of copy in the whole project.
- `src/lib/findings-verdict.ts` system prompt for the Sonnet verdict
  call — every sentence here was tuned to dial conservatism just
  right. Pass criteria require a specific behavior match against the
  ticket's acceptance criteria; "looks fine" verdicts default to
  inconclusive. Don't relax this without explicit John direction.
- `src/lib/mvp-ticket-checklist.ts:extractAgentTestUpdate` parser
  (around line 1862) — the format spec for the 66 Agent Test Update
  comments posted to Jira this session. The labeled-value format
  (`Agent testing:` / `Build/commit:` / `Human verification needed:` /
  etc.) is referenced by every batch agent that writes to Jira tickets.
  Don't change the field names or it'll silently break the parser on
  every existing comment.
- `src/lib/findings-verdict.ts:extractHumanTestResults` — symmetric
  parser for Human Test Result comments. Same caution.
- `docs/blip-test-buddy-agent-handoff.md` — product spec. "Mental
  Model" section is load-bearing. Order of authority:
  1. Jira ticket fields and comments
  2. Local deterministic checklist rules
  3. Generated human-readable UI
  4. Optional Haiku wording
  Don't invert this.

## How to talk to John

- **Direct**, not formal. He's the CEO; he reads fast.
- **Honest about gaps.** "This doesn't work yet because X." beats
  "I think this might work, let me try."
- **Plain options when something needs his decision**, with a
  recommendation. He'll usually pick the recommended one in two words.
- **Push back when you disagree.** This session he proposed Haiku for
  the verdict route; I pushed back on Sonnet being right for binary
  shipping decisions and he agreed. Sycophancy wastes his time.
- **Show him the screen**, not the code. He doesn't read source.
- **Translate AI output for him on the spot** when it's technical.
  Don't make him decode dev-speak.

## Tools used in this session

MCP servers active (load schemas via `ToolSearch` when you need them):
- **Atlassian** (`mcp__d3a12a7d-…__*`) — Jira read/write,
  Confluence. Used for: `getJiraIssue`, `searchJiraIssuesUsingJql`,
  `addCommentToJiraIssue`, `getTransitionsForJiraIssue`,
  `transitionJiraIssue`, `createJiraIssue`, `createIssueLink`,
  `editJiraIssue`. Atlassian rate limits show as 401/404 (not 429);
  sleep ≥1s between calls, ≥15s between bulk-create batches.
- **Sentry** (`mcp__b090aa76-…__*`) — `find_organizations`,
  `find_projects`, `search_events`, `search_issues`. Sentry org is
  `heyblip` at `https://us.sentry.io`. Projects: `apple-ios`,
  `blip-auth`, `blip-relay`.
- **Vercel** (`mcp__f471d4b0-…__*`) — `list_teams`, `list_projects`,
  `list_deployments`. **`deploy_to_vercel` is a guidance tool**, not
  an actual deployer — it just returns instructions to run
  `vercel deploy`. Real deploy is via CLI with explicit `--token`.
  Project: `prj_Z5kfcwK8I5FmH76mrNAt1xWBCVCi` on team
  `team_BIY0o5dvaBb15JdKNSrFl6W6`.
- **Chrome MCP** (`mcp__Claude_in_Chrome__*`) — `navigate`,
  `browser_batch`, `computer`, `tabs_context_mcp`, `javascript_tool`,
  `read_network_requests`. Used heavily for the end-to-end walkthrough
  of BDEV-352. Single tab on tabId `440218611` in this session.
  **`file://` URLs get rewritten to `https://file://` by the
  navigate tool** — spin up a local http server (`python -m
  http.server`) to serve static mockups instead.
- **Cloudflare** (`mcp__19e8d18d-…__*`) — not used in this session
  but available for D1 / KV / R2 / Workers if you need to touch the
  iOS app's auth / relay / cdn workers.

The mockups are served at `http://127.0.0.1:8932/` while the Python
http server is running (background process from this session). May or
may not be alive in your session; restart with `python -m http.server
8932` from the `design/` folder.

## How to keep your context clean

This project sprawls. After ~50-60 tool calls, dispatch sub-agents for
isolated work rather than doing it inline. Patterns that worked this
session:

- **Background `Agent` with `model: "opus"` and `run_in_background:
  true`** for substantial implementation tasks. Returns a single
  report when done. The Findings/Verdict feature, the chip-color fix,
  and now the queue + detail rebuilds were all done that way. The
  agent's prompt was 100+ lines of detailed brief — invest in the
  prompt, it pays off.
- **Parallel agents with file-boundary contracts** — three Jira
  comment batches (22 tickets each) ran in parallel this session
  paced at 2s/call to stay under Atlassian rate limits; the two build
  agents currently in flight use the same pattern. Boundaries: each
  agent owns specific files; never touches the other's.
- **Worktrees for git work** to avoid disturbing the main checkout
  state. `git worktree add ../<name> -b feat/<name>`, do the work,
  `git worktree remove --force` at the end.

## Final state checklist for the next PM

- [x] 66 Agent Test Update comments posted to Verifying tickets
- [x] Findings + AI verdict + close-or-reopen feature live
- [x] Kimi → Haiku rename + sanitisation drop live
- [x] Mark Done success banner + step-button clarity + always-on
      Mark-done-anyway live
- [x] Surface chip 4-state classifier live
- [x] End-to-end Chrome walkthrough on BDEV-352 verified everything
- [x] PR #2 merged on fork; main now reflects production
- [ ] (in flight) `/queue` page build agent — branch
      `feat/queue-page-build`
- [ ] (in flight) detail page rebuild agent — branch
      `feat/detail-redesign-build`
- [ ] (open) merge both branches when agents return + deploy + verify
- [ ] (open) rotate the Vercel token used this session
- [ ] (open) delete BDEV-352 E2E test comment
- [ ] (open) add upstream Jira automation rule for status drift
- [ ] (open from 2026-05-08) `GITHUB_TOKEN` → fine-grained PAT
- [ ] (open from 2026-05-08) `dSYM` warning on Sentry.framework
- [ ] (open from 2026-05-08) ASC API for true TestFlight-ready signal
- [ ] (open from 2026-05-08) Vercel KV / collision indicator (Pro plan
      blocker)

That's it. Read `docs/buddy-pm-handover-2026-05-08.md` for older
context, then `docs/blip-test-buddy-agent-handoff.md` for product
spec. After that, check the two in-flight agents (`af634aafbe32340b0`
queue, `aab861bee765b30b2` detail) and continue from where this
session ended.
