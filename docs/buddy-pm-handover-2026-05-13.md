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

## What landed AFTER this handover was first written (end of session 2026-05-13 ~13:00 AWST)

The two build agents finished, their branches were merged, two visual
nesting bugs were caught + fixed + deployed, and visual verification
was completed end-to-end on desktop + mobile. **Everything described
in the original "What's in flight" plan below is now live on the orcin
URL.**

### Build agents — both landed

#### Queue overview page — `feat/queue-page-build` (now merged, branch deleted)

- 2 commits: `7a84c35` (lib + API extensions) + `2a18af2` (queue page)
- 3 new files: `src/app/queue/page.tsx`, `QueueClient.tsx`, `QueueCard.tsx`
- 2 modified: `src/lib/ticket-queue.ts` (added `labels`, `hasAgentTestUpdate`, `hasHumanTestResult` fields + `"labels"`/`"comment"` in `QUEUE_FIELDS`), `src/app/api/mvp-ticket-checklist/queue/route.ts` (accepts `?limit=all`)
- 8 new tests in `src/lib/ticket-queue.test.mjs`; total 61 tests now
- **Two honest judgment calls** the agent made:
  - Dropped the "Track: All" filter chip (would've needed a dropdown/multi-select → broke "one thing on the page")
  - Dropped per-ticket stage progress bars on "In progress" cards (no stage-percent data; would've been arbitrary numbers → broke "honest UI states")

#### Detail page redesign — `feat/detail-redesign-build` (now merged, branch deleted)

- 2 commits: `4180e30` (extract 10 component files) + `57feb37` (rewrite JSX shell)
- `MvpTicketChecklistClient.tsx` shrunk **3020 → 1522 lines** (50% smaller, well under the ~1900 target)
- 10 new component files under `src/app/mvp-ticket-checklist/_components/`:
  `StepTabs`, `FocusCard`, `QueueBreadcrumb`, `AgentTestSummary`,
  `FindingsPanel`, `PastHumanTestResults`, `AskBuddyInline`,
  `ErrorPanel`, `SmallComponents`, `shared.ts`
- Visible layout now: QueueBreadcrumb → ticket identity row → StepTabs
  → FocusCard (step-specific body) → Ask Buddy inline button → 6
  `DisclosurePanel` drawers (5 content + 1 "Debug & ticket actions")
- Step 1: AgentTestSummaryPanel inline + past results
- Steps 2-3: `AgentTestSummaryChip` (collapsed, expandable) + past results
- Step 4: FindingsPanel + verdict card if submitted + past results
- Mobile Step 4: 3 verdict action buttons render in a `position:sticky bottom-0` action bar with `env(safe-area-inset-bottom)` padding when the verdict card is showing on `<md` viewports
- Step tabs collapse to 2×2 grid on mobile (`md:flex-row flex-wrap`)

### Merge + deploy + nesting fixes (end-of-session sequence)

In commit order on the Buddy branch:

5. **`6017177`** — `merge(buddy): queue overview page (Concept A) — feat/queue-page-build` + `merge(buddy): detail page redesign (Concept A) — feat/detail-redesign-build`. Both feature branches merged cleanly, no conflicts (file-boundary contract held). Tests + tsc + lint + build all green. Pushed + deployed via `vercel deploy --prod --yes`.

6. **`1d3c5c5`** — `fix(buddy): collapse nested borders on detail-page inner panels`. John spotted matryoshka effect: outer FocusCard `border-white/10 bg-black/30` + AgentTestSummaryPanel inner `border-white/15 bg-black/40` + PastHumanTestResultsPanel inner `border-white/10 bg-black/30` (identical to outer, made it break out as a sibling). Each inner panel's outer wrapper changed to `mt-5 border-t border-white/10 pt-5` — top divider + spacing instead of own box. The verdict callout (emerald/amber/sky bordered) stays — that's intentional semantic emphasis, not generic panel chrome. Same fix applied to FindingsPanel's outer wrapper.

7. **`195a8eb`** — `fix(buddy): drop per-result borders in Past Test Results panel`. John spotted the same nesting one level deeper: each individual result item still had `rounded-xl border ${tone.border}`. Dropped to just `rounded-xl ${tone.bg}` — verdict-tinted background + the colored chip at top provide enough semantic distinction without a full bordered box.

### Visual verification done (Chrome MCP, this Windows box)

Desktop @ 1354px:
- ✅ `/queue` renders queue with banner + filter chips + 3 grouped sections
- ✅ Detail Step 1: ticket header + step tabs + AgentTestSummaryPanel inline, no nested borders, surface chips with correct icons (✓/—/⏱/✗) per `classifySurfaceResult`, legend below
- ✅ Detail Step 2: AI summary collapsed to a chip with build number ("AI summary · 8 steps · build 65")
- ✅ Detail Step 3: same chip-collapse pattern
- ✅ Detail Step 4: FindingsPanel renders inline in focus card, Past Test Results below with INCONCLUSIVE chip from earlier E2E test
- ✅ Queue → click card → detail page navigation works
- ✅ QueueBreadcrumb shows "23 ready · BDEV-416 next" position

Mobile @ 390px:
- ✅ Queue header stacks; filter chips horizontal-scroll
- ✅ Detail step tabs wrap to 2×2 grid
- ✅ Detail focus card stretches full-width with 16px gutters
- ✅ AI summary chip-collapse works on mobile

Mobile @ 390px NOT visually verified (CSS path verified in code only):
- ⚠️ Step 4 sticky bottom action bar — only renders when a live verdict card is showing AND viewport `<md`. BDEV-352 is now Done so we can't trigger a fresh verdict without polluting a closed ticket. The CSS class (`fixed bottom-0 left-0 right-0 ... safe-area-inset-bottom`) is wired correctly per the agent's report; will activate on the next real Submit findings → Sonnet verdict on an open ticket.

### Worktrees cleaned up

Both `heyblip-au-fork-queue` and `heyblip-au-fork-detail` removed via
`git worktree remove --force`. Both `feat/queue-page-build` and
`feat/detail-redesign-build` branches deleted. Only the main worktree
at `heyblip-au-fork-clone` remains on `improvements/test-buddy-clarity-and-coach-tighten`
at `195a8eb`.

### Active ticket state churn during the session

John was actively closing tickets in Jira during the verification
phase. The queue dropped from 50 → 42 → 23 over the course of the
afternoon. BDEV-352 (the canonical test ticket for the Findings flow)
was closed to `Done`. This is fine — it just means future verification
of Step 4 sticky bar needs a fresh Verifying-status ticket with no
prior Human Test Result on it.

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

### Vision John surfaced end-of-session: "Buddy as a command centre"

John's framing at the end of the session: *"this dashboard can be a
bit of a command centre for the project"* — i.e., extend Buddy from a
testing-only dashboard into a broader project-management hub. The
existing Findings → Sonnet verdict → Jira write architecture is the
template — same shape applies to many more operations. Plumbing is in
place; future features are mostly UI + a new API route per action.

### Next planned ship — "Generate AI Summary" button

The headline ask John surfaced: *"how do I get AI Summaries into the
tickets that don't have them?"* — currently done by manually spawning
batch agents (66 tickets in one go this session). Plan for an in-Buddy
button that does it on-demand, ticket-by-ticket.

- **Where the button lives**:
  - Detail page: when a Verifying ticket lacks an Agent Test Update,
    the current fallback message gets a `[Generate AI Summary]` button.
  - Queue page: cards with the muted "No AI summary yet" pill get a
    small ✨ "Generate" affordance.
- **API route**: new `/api/mvp-ticket-checklist/generate-summary/route.ts`,
  mirrors the Findings/Verdict route shape — Jira fetch (description +
  linked PR diff if available) → Sonnet 4.6 → Jira write of an Agent
  Test Update in the exact parser format → return success.
- **AI prompt design**: same conservatism dial as the Findings verdict
  — ground in the ticket description + any linked PR; use "Not run" /
  "N/A" liberally for surfaces we can't verify; plain English for the
  Human test requested numbered list.
- **Estimate**: ~250-350 LOC, 1 build agent, ~2-3 hours wall-clock.
- **Cost per generation**: ~$0.02 in Sonnet tokens, ~10s.

Once this lands manually, a cron variant (auto-fill the backlog) is a
~50 LOC follow-up. Same pattern.

### Backlog gap — "Not yet picked up" section

Discovered during end-of-session walk-through: the queue's JQL is
`project = BDEV AND status in ("In Progress", "Verifying", "Selected")`
— so **tickets in `To Do` status don't surface in the queue**.
Confirmed multiple `To Do` tickets sitting unloved: BDEV-496, 495,
494, 492, 481, and more. The mockup didn't include this because the
queue was designed strictly for "testable" work, but John said "more
than 23 tickets are open" — he was counting the To Do backlog.

Two options when ready to add:

1. **Loosen the queue JQL** to also include `To Do`, add a 4th grouped
   section "Not yet picked up" between the existing "In progress" and
   "Waiting to start". Tiny change: ~20 LOC in `QueueClient.tsx` +
   `buildQueueJql()`.
2. **Leave it filtered** and accept that Buddy is testing-focused —
   John can always go to Jira for the full backlog.

Recommendation: ship option 1. The user explicitly asked for visibility.

### Pending housekeeping (low priority but worth ticking off)

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

## Late-session sprint: command-centre features shipped

After the handover was first updated to end-of-session state, John
asked for the two next-ship features in one push:

### 22 more Agent Test Updates posted

Three parallel batch agents (`a13a0a8…` 8 tickets, `a8704741…` 7
tickets, `a8773e1…` 7 tickets) backfilled every In Progress + Verifying
ticket that lacked a structured comment — 22 in total. Mix:

- **2 Verifying** (BDEV-490, BDEV-416): full test plans, `passed` /
  `build 65` / `yes`. John's actual ready-to-test pile.
- **20 In Progress** (BDEV-489, 477, 419, 413, 412, 410, 409, 407,
  405, 378, 366, 365, 363, 362, 361, 360, 359, 353, 253, 250):
  preview-style summaries, `inconclusive` / `pending` / `not yet —
  AI work in flight`. The Human test requested list pulls from each
  ticket's acceptance criteria.

Same MCP response-crossing oddity surfaced again on BDEV-359 (Batch C)
and BDEV-366 (Batch B) — Atlassian MCP `addCommentToJiraIssue` returns
a payload echoing a different ticket's body, but the actual write
lands correctly. Verified post-hoc both times. Worth a bug report to
the MCP server maintainer — three different agent sessions independently
observed it.

### Generate AI Summary button + "Not yet picked up" backlog section

Single PR built in a fresh worktree (`heyblip-au-fork-features` on
`feat/generate-summary-and-backlog-section`, now removed). Two commits:

- **`826960d`** — `feat(buddy): add Generate AI Summary button + API for ticketless summaries`
  - New `src/app/api/mvp-ticket-checklist/generate-summary/route.ts` (+262 LOC) mirrors the Findings/Verdict route shape: fetch ticket from Jira → Claude Sonnet 4.6 over OpenRouter → post the drafted Agent Test Update comment → return success. Idempotent — returns 409 if a summary already exists. 30s in-memory dedup cache keyed on issueKey.
  - New `src/app/mvp-ticket-checklist/_components/GenerateSummaryButton.tsx` (+157 LOC) — purple pill with sparkles icon, state machine (idle → submitting → done → error), success banner with auto-fade + `router.refresh()`.
  - New `src/lib/generate-summary-prompt.ts` (+176 LOC) — pure helpers for prompt building. Status-aware: `Verifying` tickets get `passed`/`build 65` framing; In Progress tickets get `inconclusive`/`pending`/preview framing.
  - New `src/lib/generate-summary-prompt.test.mjs` (+207 LOC) — 17 tests covering the prompt-building helpers + JSON response parsing.
  - Visible on the detail page where the AgentTestSummary fallback used to render.
  - Visible on the queue page as a `✨ Generate` pill replacing the "No AI summary yet" muted pill on every card lacking a summary. Card-internal click that `stopPropagation()`s so the surrounding link doesn't navigate.

- **`fb37d21`** — `feat(buddy): surface 'Not yet picked up' backlog section in /queue`
  - `src/lib/ticket-queue.ts:buildQueueJql()` loosened to `status in ("To Do", "In Progress", "Verifying", "Selected")`. `isTestable()` updated so the 3 original sections still exclude To Do — backlog is a 4th bucket.
  - `src/app/queue/QueueClient.tsx` added a 4th section after "Waiting to start" (urgency-descending order). Section dot is muted purple (`bg-[var(--accent)]/60`), tagline "Sitting in the backlog · AI hasn't started".
  - New filter chip "Backlog (N)" alongside "Ready for me", "Launch blockers", etc.
  - The new section's cards all carry the Generate pill from feature 1 — naturally ties the two features together.

Build agent's design decisions (all flagged in the report, all sound):
1. Backlog placement at bottom (urgency-descending order — testable first)
2. Muted-purple dot (signal continuity, not a fourth distinct colour)
3. `QueueCard` restructure: `<article>` + absolute sibling `<Link>` instead of `<Link>` wrapping a `<button>` (invalid HTML otherwise; needed for `stopPropagation` on the Generate pill)
4. Generate button gated to Verifying / In Progress / In Review / Ready statuses on the detail page (matches "for To Do the existing Send to Codex/Claude flow handles it" — but To Do cards still trigger Generate via the queue pill)

### Merge + deploy

Single `--no-ff` merge of `feat/generate-summary-and-backlog-section`
into the Buddy branch, resolved as `29e17b1`. 81/81 tests pass, tsc
clean, lint clean (one pre-existing `_NODE_R_BASE` warning), next
build succeeds. Pushed + deployed via `npx vercel deploy --prod
--yes --token=...`, aliased to orcin in ~40s.

### End-to-end verification

- ✅ Queue page now shows **50 tickets across testing · 2 ready for
  you** (up from 23 — the 27 backlog tickets that were filtered out
  before now surface)
- ✅ New "Backlog (27)" filter chip present alongside the others
- ✅ "Not yet picked up · 27 tickets · Sitting in the backlog · AI
  hasn't started" section renders below "Waiting to start"
- ✅ Every backlog card shows the `✨ Generate` purple pill (replaces
  the muted "No AI summary yet" pill)
- ✅ Generate flow verified live: `fetch('/api/.../generate-summary',
  {issueKey: 'BDEV-252'})` → Sonnet drafted → Jira comment 10449
  posted → queue refresh → BDEV-252's pill swapped from `Generate` to
  green `AI summary`
- ✅ Worktree `heyblip-au-fork-features` removed, feature branch
  `feat/generate-summary-and-backlog-section` deleted

### One pre-existing issue noticed (not introduced by today's work) — fixed in `49ba244`

The loosened JQL surfaced BDEV **Epics** as cards in the backlog
(BDEV-380 Push Notifications, BDEV-382 Auth & Identity, BDEV-383 Chat
Experience, BDEV-385, BDEV-386, BDEV-387, BDEV-381). Epics aren't
testable. Fixed by adding `AND issuetype != "Epic"` to
`buildQueueJql()`. Verified on production — no Epic cards in the
backlog after redeploy.

### Late-late-session: queue gap fix (`49ba244`)

John spotted a conceptual gap mid-conversation: an In Progress ticket
where the AI claims `Agent testing: passed` but the Jira workflow
status didn't auto-transition would be stuck in "In progress" forever
— the queue bucketing only looked at status + humanFinalReview +
loopStage, never at the AI summary's own pass/fail signal. Same root
cause as the BDEV-493 status-drift bug, surfaced from a different
angle.

Shipped two fixes in `49ba244`:

1. **Epic filter** — see above.
2. **Queue bucket fallback** — `scanComments` now also parses the
   `Agent testing:` labelled value from the Agent Test Update comment
   ("passed" / "failed" / "inconclusive" / "unknown"). The new field
   `agentTestUpdateStatus` propagates through `QueueCandidate` →
   `QueueRow` → `QueueRowView`. `isReady` in `QueueClient.tsx` adds a
   final fallback: `status === "in progress" && agentTestUpdateStatus
   === "passed"` → promote to "Ready for you".
   - Defence in depth alongside the eventual Jira automation rule fix
     (`PR opened → To Do → In Progress`). Either fix alone closes the
     drift; both makes it bulletproof.
   - 6 new tests in `ticket-queue.test.mjs`. Now 86 tests across the
     four test files (was 81 after the build agent's work).
   - No current ticket triggers the fallback (all 20 In Progress
     tickets got `inconclusive` previews from the batch agents, none
     `passed`), but the path is wired and will fire on the next real
     PR merge that posts `passed` without the workflow moving.

## Final state checklist (end of session 2026-05-13 ~14:30 AWST)

- [x] 66 + 22 = **88 Agent Test Updates** posted to Verifying + In
      Progress tickets via 6 batch agent runs total
- [x] Findings + AI verdict + close-or-reopen feature live
- [x] Kimi → Haiku rename + sanitisation drop live
- [x] Mark Done success banner + step-button clarity + always-on
      Mark-done-anyway live
- [x] Surface chip 4-state classifier live
- [x] PR #2 merged on fork; main now reflects production
- [x] `/queue` page built + merged + deployed
- [x] Detail page rebuild built + merged + deployed
      (`MvpTicketChecklistClient.tsx` 3020 → 1522 LOC)
- [x] Detail page nesting fixes deployed
- [x] **Generate AI Summary button live** (detail page + queue cards)
- [x] **"Not yet picked up" backlog section live** (27 cards visible)
- [x] End-to-end verification on the Generate flow (BDEV-252 confirmed)
- [x] All worktrees removed, all feature branches deleted
- [x] Epic filter on queue JQL shipped (`49ba244`)
- [x] Queue Ready-bucket fallback for `passed` In Progress tickets
      shipped (`49ba244`) — defence in depth alongside the eventual
      Jira automation rule fix
- [ ] (open, user-action) Rotate the Vercel token used this session
      (`vcp_2wdlx11BFSHm…`). Generate a new one at
      `https://vercel.com/account/tokens`, revoke the old.
- [ ] (open, user-action) Delete BDEV-352 E2E test comment from Jira
      UI (cosmetic, harmless — Atlassian MCP doesn't expose a
      delete-comment tool from this box)
- [ ] (open, user-action) Delete BDEV-252 verification-test comment
      (commentId 10449 — the Generate-flow smoke test from today;
      same Atlassian-MCP limitation)
- [ ] (open, user-action) Add upstream Jira automation rule for
      BDEV-493-style status drift (PR opened → To Do → In Progress).
      ~3 minutes at https://heyblip.atlassian.net/jira/settings/automation
- [ ] (small follow-up code) Triage stalled In Progress tickets — JQL
      for `updated < -30d AND status = "In Progress"`, flag ones that
      look truly abandoned vs ones with recent activity, propose
      closes. More research than code; defer to next session.
- [ ] (open from 2026-05-08) `GITHUB_TOKEN` → fine-grained PAT
- [ ] (open from 2026-05-08) `dSYM` warning on Sentry.framework
- [ ] (open from 2026-05-08) ASC API for true TestFlight-ready signal
- [ ] (open from 2026-05-08) Vercel KV / collision indicator (Pro plan
      blocker)

That's it. Read `docs/buddy-pm-handover-2026-05-08.md` for older
context, then `docs/blip-test-buddy-agent-handoff.md` for product
spec. The session ended with **all command-centre primitives in
place**: bird's-eye queue with 4 grouped sections including backlog,
detail page redesigned to one calm focus card per step, on-demand
Generate AI Summary button for any ticket lacking one, full
Findings → Sonnet verdict → Jira close-or-reopen loop. Same
architecture (Jira fetch → Sonnet → Jira write → render) unlocks
the next feature, whatever it is.
