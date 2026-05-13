// Builds the AI prompt for "Generate AI Summary" — the on-demand
// counterpart to the batch-agent script that posts an Agent Test Update
// comment to a Jira ticket. Pure functions only; the route in
// src/app/api/mvp-ticket-checklist/generate-summary/route.ts handles IO
// (Jira fetch + OpenRouter call + Jira write).
//
// The model's output goes straight into a Jira comment. Format MUST match
// what extractAgentTestUpdate() expects in src/lib/mvp-ticket-checklist.ts
// (around line 1862) — labeled values like "Agent testing:" /
// "Build/commit:" / "Automated:" / "Simulator:" / "Worker smoke:" / "Human
// verification needed:", a numbered "Human test requested:" list, and an
// "Evidence:" bullet block.

export type GenerateSummaryInput = {
  issueKey: string;
  summary: string;
  status: string;
  descriptionText: string;
  acceptanceCriteria: string;
  mvpTrack: string;
  verificationSurface: string;
  verifiedBuildOrCommit: string;
  loopStage: string;
};

// System prompt — instructs the model to emit ONLY the raw Jira comment
// body in the exact parser format. Plain English; no jargon. Conservatism
// dialed high so missing details default to "Not run" / "N/A" rather than
// invention. Read by John (CEO, non-technical) on his phone before he
// tests; treat as content, not code, when editing.
export function buildGenerateSummarySystemPrompt(): string {
  return [
    "You are Buddy, drafting an Agent Test Update Jira comment for a HeyBlip BDEV ticket.",
    "The comment is read by John (CEO, non-technical) on his phone before he picks the ticket up to test.",
    "Output ONLY the raw markdown comment body — no preface, no JSON wrapping, no code fences around the whole thing.",
    "",
    "Format the comment EXACTLY like this (the headings and labels are parsed by Buddy — don't rename or reorder them):",
    "",
    "Agent Test Update",
    "",
    "Agent testing: <passed | failed | inconclusive | not run>",
    "Build/commit: <build N, commit SHA, or 'pending'>",
    "Human verification needed: <yes | no>",
    "Automated: <one-line result, or 'Not run' or 'N/A — reason'>",
    "Simulator: <one-line result, or 'Not run' or 'N/A — reason'>",
    "Worker smoke: <one-line result, or 'Not run' or 'N/A — reason'>",
    "",
    "Human test requested:",
    "1. <Plain-English step John does on his phone — what to tap, what to look for>",
    "2. <Next step>",
    "3. <Pass condition: what should happen if the fix works>",
    "",
    "Evidence:",
    "- <One short bullet of what's been verified, or 'AI work in progress — placeholder' for an in-progress ticket>",
    "- <Another bullet, or omit if not applicable>",
    "",
    "Rules:",
    "- Plain English only. No jargon. Say 'the app reconnected once' not 'WS reconnect coalescing observed'. Say 'the message arrived' not 'envelope delivery confirmed'.",
    "- Be conservative on details NOT in the ticket description. If the description doesn't say automated tests were run, write 'Automated: Not run'. If a surface is genuinely not applicable (e.g. a worker-only fix has no simulator step), write 'N/A — reason'.",
    "- The 'Human test requested' list should be 2-5 numbered steps a non-technical user can follow on an iPhone with TestFlight installed. Last step is always the pass condition.",
    "- Don't invent acceptance criteria. Pull only from what's in the ticket description.",
    "- Don't use words like 'STOP:', 'Agent Test Update' inside the body (only as the heading), 'Verified Build/Commit' in user-facing copy.",
    "- Keep the whole comment under 350 words.",
  ].join("\n");
}

// Builds the JSON-encoded user message handed to the model. Includes only
// the strictly-needed Jira fields plus an instruction tailored to the
// ticket's current status (Verifying vs In Progress).
export function buildGenerateSummaryUserPayload(input: GenerateSummaryInput): string {
  const mode = inferStatusMode(input.status);
  const expectedDefaults = expectedDefaultsForMode(mode, input.verifiedBuildOrCommit);
  return JSON.stringify({
    issue_key: input.issueKey,
    ticket_summary: input.summary,
    ticket_status: input.status,
    ticket_description: input.descriptionText || "(no description on the ticket)",
    acceptance_criteria: input.acceptanceCriteria || "(none extracted — use the description)",
    mvp_track: input.mvpTrack || "(unset)",
    verification_surface: input.verificationSurface || "(unset)",
    verified_build_or_commit: input.verifiedBuildOrCommit || "(not set)",
    loop_stage: input.loopStage || "(unset)",
    instructions_for_this_ticket: {
      mode,
      expected_agent_testing_value: expectedDefaults.agentTesting,
      expected_build_commit_value: expectedDefaults.buildOrCommit,
      tone: expectedDefaults.tone,
    },
  });
}

// Decides the "mode" we tell the model to write for: Verifying tickets
// get a "passed" framing (the fix is merged, John is testing); In Progress
// tickets get a placeholder/preview framing (work isn't done yet).
export type StatusMode = "verifying" | "in-progress" | "unknown";

export function inferStatusMode(status: string): StatusMode {
  const s = (status || "").toLowerCase().trim();
  if (/verifying|in review|ready for review/.test(s)) return "verifying";
  if (/^in progress$|^in-progress$/.test(s)) return "in-progress";
  return "unknown";
}

function expectedDefaultsForMode(
  mode: StatusMode,
  verifiedBuildOrCommit: string,
): { agentTesting: string; buildOrCommit: string; tone: string } {
  if (mode === "verifying") {
    return {
      agentTesting: "passed",
      buildOrCommit: verifiedBuildOrCommit || "build 65",
      tone:
        "The fix is merged and ready to test. Write Agent testing as 'passed', Build/commit as the build number above (or 'build 65' if none), and concrete Evidence bullets only if the description names them — otherwise keep evidence brief.",
    };
  }
  if (mode === "in-progress") {
    return {
      agentTesting: "inconclusive",
      buildOrCommit: "pending",
      tone:
        "AI is still coding this — don't claim it's done. Write Agent testing as 'inconclusive', Build/commit as 'pending', and use 'AI work in progress — placeholder' as the first Evidence bullet. Human test requested can still describe what John WILL test once the build lands.",
    };
  }
  return {
    agentTesting: "inconclusive",
    buildOrCommit: verifiedBuildOrCommit || "pending",
    tone:
      "Status is unclear. Default to 'inconclusive' for Agent testing. Be conservative on every surface line — if you can't verify it from the description, write 'Not run'.",
  };
}

// Light sanity check that the model returned something that looks like an
// Agent Test Update comment. Used by the route to detect a malformed
// response before posting to Jira.
export function looksLikeAgentTestUpdate(body: string): boolean {
  const text = body || "";
  if (!/agent test update/i.test(text)) return false;
  if (!/agent testing\s*:/i.test(text)) return false;
  if (!/build\/?commit\s*:/i.test(text)) return false;
  return true;
}

// Strips wrapping code fences the model sometimes adds despite the
// "no code fences around the whole thing" instruction. We only strip the
// outermost fence — inline ``` blocks (e.g. inside Evidence) stay intact.
export function unwrapOuterCodeFence(raw: string): string {
  const trimmed = (raw || "").trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

// In-memory dedup cache keyed on issueKey, so a double-click doesn't
// double-post. 30s TTL mirrors the findings verdict cache.
const GENERATE_CACHE_TTL_MS = 30_000;

type CachedGeneration = {
  expiresAt: number;
  body: unknown;
};

const generateCache = new Map<string, CachedGeneration>();

export function getCachedGeneration(key: string, now: number): unknown {
  const cached = generateCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    generateCache.delete(key);
    return null;
  }
  return cached.body;
}

export function setCachedGeneration(key: string, body: unknown, now: number): void {
  generateCache.set(key, { expiresAt: now + GENERATE_CACHE_TTL_MS, body });
}
