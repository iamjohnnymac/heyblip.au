# Blip Test Buddy Agent Handoff

## Purpose

Blip Test Buddy is a hidden internal checklist page for John and Tay. It loads one Jira ticket, turns it into plain-English verification steps, and helps keep the MVP stabilization loop focused on one ticket at a time.

The page is intentionally unlisted:

- Route: `/mvp-ticket-checklist`
- Local example: `http://localhost:3049/mvp-ticket-checklist?issue=BDEV-493`
- Do not add it to public nav, footer, sitemap, or marketing pages.

The core product idea is:

> Jira remains the source of truth. Blip Test Buddy is the friendly guide sitting on top of Jira.

## What Was Built

The page now has a simpler “do one safe thing next” layout:

- ticket search/load box
- ticket summary and Jira link
- STOP/READY/DONE banner
- visible Blip Test Buddy mascot area
- one expanded current action card
- progress rail: `Agent proof -> Build -> Test -> Jira result`
- collapsed supporting drawers
- dynamic agent prompt drawer
- copy-paste Jira update helpers
- optional sanitized Kimi/OpenRouter coach

The UI is designed for a non-coder. It should say what John/Tay should do next, not expose technical Jira field noise first.

## Main Files

- `src/app/mvp-ticket-checklist/page.tsx`
  - Server page.
  - Reads the `issue` query param.
  - Reads Jira token from env or local HttpOnly cookie.
  - Calls the checklist builder and renders the client UI.

- `src/app/mvp-ticket-checklist/MvpTicketChecklistClient.tsx`
  - Main client UI.
  - Handles tick state, active step, drawers, copy buttons, Buddy helper, and coach calls.

- `src/lib/mvp-ticket-checklist.ts`
  - Main checklist engine.
  - Reads Jira issue data.
  - Converts Jira fields into human steps, agent instructions, proof requirements, stop reasons, and copy-paste text.
  - Local deterministic rules live here and should remain authoritative.

- `src/lib/mvp-ticket-checklist.test.mjs`
  - Node tests for checklist generation and sanitization behavior.

- `src/app/api/mvp-ticket-checklist/coach/route.ts`
  - Kimi/OpenRouter coach endpoint.
  - Sends only sanitized ticket shape/context.
  - Falls back to local deterministic guidance if Kimi fails or returns empty text.

- `src/app/api/mvp-ticket-checklist/jira-token/route.ts`
  - Local helper for saving a Jira API token into an HttpOnly localhost cookie when env is missing.

- `public/mascot/blip-bot.png`
  - Cartoon Blip Test Buddy mascot asset.

## Environment Variables

Use names only in docs and logs. Never expose real values.

Required for live Jira loading:

```bash
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
```

Optional for AI helper:

```bash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=moonshotai/kimi-k2.6
```

If `JIRA_API_TOKEN` is not present in env, the local token route can store it in a browser cookie for localhost. Do not commit `.env.local`.

## Jira Fields Used

The checklist is driven by the stabilization fields:

- `MVP Track`
- `MVP Loop Stage`
- `Verification Surface`
- `Human Final Review`
- `Verified Build/Commit`

These fields decide the route through the loop, but the page should translate them into human language.

Important states:

- Missing agent proof or missing build means John/Tay should stop.
- If required surface includes real-device work, John/Tay must do final verification.
- If verification is only automated/simulator/worker smoke, an agent can provide proof and ask John/Tay to review the evidence.
- Humans are the only ones who should mark final human review as passed.

## Agent Test Update Contract

The dashboard expects coding agents to post a structured Jira comment after they finish coding and running tests.

The comment should be titled:

```text
Agent Test Update
```

It should include:

- ticket key
- branch
- PR link if available
- commit or build tested
- what was changed
- automated tests run and result
- simulator tests run and result
- worker/smoke checks run and result, if relevant
- what was not tested
- what John/Tay must test on real devices
- whether the ticket is ready for human verification

Without this comment, the page should show:

```text
STOP: waiting for agent
```

## Dynamic Agent Prompt

The “Prompt for coding agent” drawer generates a copy-paste prompt for another coding agent.

The prompt is dynamic based on:

- ticket key and title
- Jira status
- MVP track
- verification surfaces
- linked issues
- required proof recipe
- current human test plan
- whether real phones/TestFlight/APNs/BLE are required

The prompt should keep these rules:

- one ticket only
- smallest safe code change
- no broad refactors
- create a branch like `fix/BDEV-493-short-name`
- run targeted tests
- add a failing test where practical
- post Agent Test Update in Jira
- open a PR linked to the Jira ticket
- do not merge
- do not set `Human Final Review = Passed`

## Kimi Coach Behavior

The AI helper is optional and must stay lower authority than local rules.

Local rules decide:

- active step
- STOP/READY/DONE state
- whether human verification is required
- what Jira updates are required

Kimi only rewrites the Buddy speech bubble in friendlier language.

The coach route sends richer sanitized context, not raw Jira data. It may include:

- issue type
- Jira status
- MVP track
- loop stage
- verification surfaces
- proof/build presence
- current step title/body/pass/fail
- generated human steps
- generated proof recipe
- generated agent instructions
- generated Jira update requirements
- generated stop reasons
- short sanitized issue excerpt

It must not send:

- raw Jira descriptions
- raw comments
- names or account details
- emails
- URLs
- logs
- stack traces
- secrets
- long IDs, hashes, or tokens

If Kimi times out, errors, or returns empty text, show local Buddy guidance without a scary error badge.

## Current UX Notes

Buddy must be obvious on the page.

Current approach:

- STOP/READY/DONE banner includes a small mascot strip and `Show Buddy` button.
- Current action card contains the full Buddy guide.
- `Ask Buddy` updates the visible speech bubble.
- `Next step` scrolls to the active step.
- `Hide` hides the helper, but the banner can show it again.

Avoid going back to a long dashboard-first layout. The first screen should answer:

> What do I do right now?

## Supporting Drawers

Supporting information should stay collapsed by default:

- `What this ticket needs`
- `Can this be done in simulator?`
- `Prompt for coding agent`
- `Copy-paste Jira update`
- `Technical Jira fields`
- `Debug details`

These drawers are for extra context, not the primary experience.

## How To Run Locally

From `/Users/johnmckean/heyblip.au`:

```bash
npm run dev
```

Then open:

```text
http://localhost:3049/mvp-ticket-checklist?issue=BDEV-493
```

If the dev server chooses a different port, use that port.

## Verification Commands

Run these after code changes:

```bash
node --test src/lib/mvp-ticket-checklist.test.mjs
npm run lint
npm run build
```

Known lint note at time of writing:

- `npm run lint` passes but reports an existing unrelated warning in `blipmesh/blip-mesh.jsx` for `_NODE_R_BASE`.

Browser checks to perform:

- load `BDEV-493`
- confirm Buddy is visible
- confirm STOP banner appears when agent proof/build is missing
- click `Show Buddy`
- click `Ask Buddy`
- click `Next step`
- open and close each drawer
- check mobile width for no overlap

## Security Rules For Future Agents

Do not print or commit secrets.

Do not log raw Jira descriptions/comments to browser console, server logs, screenshots, docs, or AI requests.

Do not send raw Jira text to OpenRouter/Kimi.

Do not make Kimi authoritative. It is copywriting help only.

Do not make this a public marketing page.

Do not add Jira write-back unless explicitly requested. Current pass is read plus copy-paste helpers.

## Good Next Improvements

Potential future work:

- Jira write-back for Agent Test Update comments.
- Jira write-back for MVP fields.
- Stronger parser for structured Agent Test Update comments.
- Better dashboard links into Jira filters.
- Add browser automation tests once the project has Playwright installed.
- Add a “copy full coding-agent prompt” button near the top when the ticket is waiting for agent proof.

## Mental Model

For any future change, preserve this order of authority:

1. Jira ticket fields and comments.
2. Local deterministic checklist rules.
3. Generated human-readable UI.
4. Optional Kimi wording.

Blip Test Buddy should feel like a calm checklist coach, not another technical dashboard.
