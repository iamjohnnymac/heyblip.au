# Blip Test Buddy — PM Handover · 2026-05-08

You're picking up Blip Test Buddy mid-stream. This doc is self-contained;
read it cold, then the inline `docs/blip-test-buddy-agent-handoff.md` for
the original product spec. After that, you'll know everything that matters.

## What Buddy is (one line)

A hidden internal page at `/mvp-ticket-checklist` that turns one HeyBlip
Jira ticket into plain-English verification steps for John (CEO,
non-technical) and Tay (frontend, codes on Windows, no Xcode access).

## Who you're working for

- **John (`iamjohnnymac`)** — CEO. Non-technical. Tests fixes via TestFlight
  on his iPhone. Merges PRs himself via GitHub PAT. Hates jargon.
- **Tay (`txc0ld`)** — Frontend dev, Windows. Tests via TestFlight too
  (no local Swift builds). Smaller scope work — UI/wiring, not transport
  or crypto.
- They share the page; same access key gates the URL.

## Production state (as of this handover)

- **URL** (no SSO, just access key):
  `https://heyblipau-orcin.vercel.app/mvp-ticket-checklist?issue=BDEV-493&access=b32c74f88b271c544fb51cf68420a505`
- **Repo**: `https://github.com/iamjohnnymac/heyblip.au`
- **Branch in flight**: `improvements/test-buddy-clarity-and-coach-tighten`
  (HEAD: `f56e774` "feat(buddy): build-status chip on the active step card")
- **Local checkout**: `/Users/johnmckean/heyblip.au` — same branch
- **Latest deploy**: live, all changes through the Apple-processing-state
  chip update have shipped.
- **iOS repo `iamjohnnymac/heyblip`**: main is clean. 0 open PRs at hand-off.
  Build 65 in TestFlight contains everything from main (BDEV-493 auth fix
  plus all 5 of Tay's recent PRs).
- **John's local iOS checkout** at `/Users/johnmckean/heyblip` has many
  dirty files on branch `codex/test-hardening-recurring-issues`. **NOT
  YOUR WORK. DO NOT TOUCH.** Always verify with `git status -s` before
  doing anything in that repo.

## What Buddy now does end-to-end

1. **Picks the next ticket to test**. The "What should I test next?"
   strip at top calls `/api/.../queue`, ranks tickets by age-in-status +
   downstream blockers + priority + risk + recently-loaded penalty.
   Filter only surfaces *testable* tickets (Verifying status, or has
   build named, or Human Final Review = Ready, etc).
   - Files: `src/lib/ticket-queue.ts` (pure ranking, 8 unit tests),
     `src/app/api/mvp-ticket-checklist/queue/route.ts`.

2. **Loads the ticket** via the existing Jira engine
   (`src/lib/mvp-ticket-checklist.ts`). Renders four phases:
   AI summary → Build → Test → Result. Pass/Fail boxes per step.
   Step 1 has 3 sub-states based on Jira status:
   - "Send this to an AI to start" (To Do / Selected / Reproducing)
   - "AI is still coding this" (In Progress, no agent comment yet)
   - "Read what the AI tested" (agent has posted summary)

3. **Live-polls Jira every 30s** via `router.refresh()`. Pauses on
   `document.hidden`. Resumes on visibility. The "Live · 12s ago" pill
   in the active step card header proves it's ticking; click to force-
   refresh. When Jira state changes (agent posted, build named), a
   green celebration banner slides in for 8s.

4. **Live-polls GitHub Actions** for the matching deploy-testflight
   workflow run. Chip on the active step card shows: queued → running
   → **Apple processing (20 min)** → ready / failed / cancelled.
   Click chip → opens the run on GitHub. The "Apple processing" state
   is a 20-min heuristic between CI success and TestFlight availability
   so the chip never lies.
   - Files: `src/lib/build-status-match.ts` (pure matching logic, 10
     unit tests), `src/app/api/mvp-ticket-checklist/build-status/route.ts`.

5. **Sends to AI** via two green CTAs in the active step card:
   "Send to Codex" / "Send to Claude". On Mac/Windows desktop these
   open the native `codex://` / `claude://` URL schemes (registered by
   Codex.app / Claude.app). On iOS / Android they fall back to
   `chatgpt.com/codex` / `claude.ai/new`. Either way the full handoff
   prompt is on the clipboard, ready to paste. Clicking auto-ticks
   step 1 because that IS the action.

6. **Coach** ("Ask Buddy") via Kimi / Anthropic / OpenRouter. Plain-
   English speech bubble in a side panel. The system prompt forbids
   the words "agent", "STOP:", "Agent Test Update", "Verified
   Build/Commit"; a `scrubJargon` post-processor sweeps anything that
   leaks. Default model is `anthropic/claude-haiku-4.5` (~7s on real
   payload). Times out at 15s, falls back to deterministic local copy
   silently.
   - File: `src/app/api/mvp-ticket-checklist/coach/route.ts`.

## Hard rules John drilled into me this session

1. **Plain English. No jargon. EVER.** "agent" → "AI". "STOP:" →
   "Hold off". "Agent Test Update" → "AI's summary in Jira".
   "Verified Build/Commit" → "build number". "Cold launch" → "open
   the app fresh". When in doubt: would this confuse a smart non-coder?
   If yes, rewrite.

2. **One thing on the page.** "Do one safe thing next." We deleted
   the H1+subhead, deleted the STOP banner, slimmed the ticket header
   to one line, hid two of the three template drawers. Don't add
   stuff back. If you ship a feature, displace something else.

3. **Honest UI states.** Don't say "ready" when it's not. The Apple-
   processing-window state was added because saying "Build ready" the
   moment CI succeeded was lying — Apple still needed 20 minutes to
   verify the binary.

4. **Brilliant.org-inspired aesthetic.** Rounded-2xl/3xl. Generous
   padding. Big confident typography (text-3xl/4xl on the main heading).
   Pill-shaped chips. Soft borders. Encouraging tone. Purple HeyBlip
   accent stays — don't swap to anything else.

5. **Mobile parity.** John tests on his phone. Every interaction must
   work on iOS Safari. URL schemes that fail on mobile MUST have a web
   fallback (we hit this with `codex://` → safari "invalid address"
   error; fixed with mobile detection + chatgpt.com fallback).

6. **John merges PRs. Period.** Engineer-agents stop at branch pushed
   + PR opened + #blip-dev notification. The CLAUDE.md rule is
   load-bearing in safety hooks — even with explicit per-instance
   authorization, auto-mode safety has blocked merges. If you need
   to merge, ask John to click it via GitHub UI.

7. **Don't touch the user's iOS-repo dirty files.** They're his WIP.
   Use `git worktree` if you need to do anything in that repo.

## Open work / known issues / next likely asks

In rough priority order if a fresh session picks up:

### Things that work but with a caveat

- **Vercel `GITHUB_TOKEN`** is currently John's `gh auth token` (a
  `gho_*` session token). It works, but session tokens can rotate.
  Should swap for a dedicated fine-grained PAT scoped to
  `Actions: read-only` on `iamjohnnymac/heyblip` only. ~5 minutes:
  generate at <https://github.com/settings/personal-access-tokens>,
  `vercel env rm GITHUB_TOKEN production` then `vercel env add` the
  new value, redeploy.
- **`MVP_CHECKLIST_ACCESS_KEY`** is the only gate on the public URL
  (Vercel SSO is off because Hobby plan can't do shareable bypass
  tokens). If it leaks, rotate via `vercel env` and redeploy.
- **20-min Apple-processing heuristic**. Real fix is to call the App
  Store Connect API to ask "is this build available in TestFlight
  yet?". Workflow already has `ASC_KEY_ID`, `ASC_ISSUER_ID`,
  `ASC_PRIVATE_KEY` secrets — copy those into Vercel env, write a
  small client, swap the heuristic. Bigger lift than it sounds.
- **20s in-memory cache** in `build-status/route.ts` doesn't survive
  serverless cold starts. Acceptable at current load. Move to KV if
  Buddy ever has many concurrent tabs.
- **Vercel KV / collision indicator**. Code paths exist
  (`src/lib/buddy-presence.ts`); will light up automatically when
  `KV_REST_API_URL` appears in env. Hobby plan blocked it; needs Pro.
- **`dSYM` warning** on every build: Sentry.framework dSYM not in
  archive, crash symbolication will be incomplete on production
  crashes. Fix is in the workflow's archive step. Not urgent.
- **Node 20 deprecation** warning in deploy-testflight workflow.
  Bump `actions/checkout@v4` to v5+ when convenient.
- **Slack integration**. The AI handoff prompt instructs the AI to
  post to `#blip-dev` etc., but Buddy itself doesn't have a Slack
  bot token wired in for direct posts. If you need Buddy itself to
  ping Slack (rather than the AI doing it), that's a fresh integration.

### Things John has hinted at but didn't ship in this session

- **Daily Slack digest** at ~9am: "8 tickets in your queue, top one
  is BDEV-486". Cron + Slack webhook. ~1 hour.
- **Mobile single-step URL** (`/next`): no ticket key, server picks
  #1 from queue, redirects. Smallest possible UX. ~30 min.
- **Tay-specific track lanes** in the queue: he gets a "your kind of
  work" filter (push, UI, observability), John gets the rest. Only
  worth it if you observe one of them consistently skipping the
  other's tickets.
- **Velocity tracking**: log verifications, show "you're testing
  4min/ticket, push backlog ETA = 24 min". Helps with weekly planning.
- **Buddy explains the #1 pick**: have Kimi rewrite the ranker's
  reasons into a short paragraph ("This one because BDEV-407 has been
  sitting 240h and blocks BDEV-493 which you already know about.").
  Currently the dropdown shows ranker reasons as machine bullets.

## Verification commands (run after any change)

From `/Users/johnmckean/heyblip.au`:

```bash
node --test src/lib/mvp-ticket-checklist.test.mjs   # 21 tests
node --test src/lib/build-status-match.test.mjs     # 10 tests
npm run lint
npm run build
npx vercel deploy --prod --yes                       # ships to canonical alias
```

The lint warning on `_NODE_R_BASE` in `blipmesh/blip-mesh.jsx` is
pre-existing and can be ignored.

## Files John wrote and you shouldn't undo

These are intentional, hand-tuned for John specifically. Don't refactor
"prettier":

- `src/app/mvp-ticket-checklist/MvpTicketChecklistClient.tsx` —
  every string in here was rewritten at least once for plain English.
  When you change copy, lean toward plainer not denser.
- `src/lib/mvp-ticket-checklist.ts:buildCodingAgentPrompt` — the AI
  handoff prompt. Has carefully built sections: Repository rules,
  Current Jira state, Sentry context (when triggered), TestFlight
  build delivery, Slack updates, Writing for John/Tay (non-coders),
  PR workflow, Stop conditions. **Read this whole function before
  changing the prompt.** It's the most-tested piece of copy in the
  whole project.
- `docs/blip-test-buddy-agent-handoff.md` — product spec. Section
  "Mental Model" is load-bearing. The order of authority is:
  1. Jira ticket fields and comments
  2. Local deterministic checklist rules
  3. Generated human-readable UI
  4. Optional Kimi wording
  Don't invert this.

## How to talk to John

- **Direct**, not formal. He's the CEO; he reads fast.
- **Honest about gaps**. "This doesn't work yet because X." better
  than "I think this might work, let me try."
- **Plain options when something needs his decision**, with a
  recommendation. He'll usually pick the recommended one in two words.
- **Show him the screen**, not the code. He doesn't read source.
- **Translate AI output for him on the spot** when it's technical.
  In this session I had to translate "install on a phone whose
  noise_public_key is missing from the auth Postgres" → "delete the
  app and reinstall from TestFlight". Don't make him decode dev-speak.

## How to keep your context clean

This project sprawls. After ~50-60 tool calls, dispatch agents for
isolated work rather than doing it inline. Patterns that work:

- **Background `Agent` with `model: "opus"` and `run_in_background:
  true`** for substantial implementation tasks. Returns a single
  report when done. The build-status chip work in this session was
  done that way; ~32 minutes wall-clock, agent shipped + deployed
  + tested while parent context handled other questions. The agent's
  prompt was 100+ lines of detailed brief — invest in the prompt,
  it pays off.
- **Worktrees for git work in either repo** to avoid disturbing the
  user's checkout state. `git worktree add /tmp/<name> origin/<base>`,
  do the work, `git worktree remove --force` at the end.

## Final state checklist for the next PM

- [x] Build-status chip live in production
- [x] Apple-processing state shipping
- [x] Sentry + Slack sections in AI handoff prompt
- [x] All 4 of John's PRs (375, 376, 391, 392) merged to main
- [x] All 5 of Tay's PRs (377, 378, 379, 380, 381) merged to main
- [x] TestFlight build 65 contains all of main
- [x] No open PRs in the iOS repo
- [x] `improvements/test-buddy-clarity-and-coach-tighten` branch pushed
      to `fork` (iamjohnnymac/heyblip.au)
- [ ] (open) Swap `GITHUB_TOKEN` to dedicated fine-grained PAT
- [ ] (open) `dSYM` warning on Sentry.framework in TestFlight builds
- [ ] (open) Vercel KV / collision indicator (Pro plan blocker)
- [ ] (open) ASC API integration for true TestFlight ready signal

That's it. Read `docs/blip-test-buddy-agent-handoff.md` for product
context, then check open Jira BDEV tickets to see what's next on the
stabilization loop.
