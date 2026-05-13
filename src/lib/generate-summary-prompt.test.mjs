// Tests for the pure helpers that build the Generate AI Summary prompt
// and screen its output. Mirrors the shape of findings-verdict.test.mjs —
// no network IO, just the prompt strings, the payload encoder, the
// status-mode inference, the parse sanity check, and the dedup cache.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGenerateSummarySystemPrompt,
  buildGenerateSummaryUserPayload,
  clearGenerationInFlight,
  getCachedGeneration,
  inferStatusMode,
  isGenerationInFlight,
  looksLikeAgentTestUpdate,
  markGenerationInFlight,
  setCachedGeneration,
  unwrapOuterCodeFence,
} from "./generate-summary-prompt.ts";

// --- System prompt sanity --------------------------------------------------

test("system prompt names every parser-required label", () => {
  const prompt = buildGenerateSummarySystemPrompt();
  for (const label of [
    "Agent testing:",
    "Build/commit:",
    "Human verification needed:",
    "Automated:",
    "Simulator:",
    "Worker smoke:",
    "Human test requested:",
    "Evidence:",
  ]) {
    assert.ok(prompt.includes(label), `prompt missing label '${label}'`);
  }
});

test("system prompt warns against jargon + invented details", () => {
  const prompt = buildGenerateSummarySystemPrompt();
  assert.match(prompt, /plain english/i);
  assert.match(prompt, /not run|n\/a/i);
  assert.match(prompt, /conservative|don.?t invent/i);
});

test("system prompt asks for the raw markdown body only (no code fences, no JSON wrapping)", () => {
  const prompt = buildGenerateSummarySystemPrompt();
  assert.match(prompt, /raw markdown/i);
  assert.match(prompt, /no.+code fences/i);
});

// --- inferStatusMode -------------------------------------------------------

test("inferStatusMode tags Verifying tickets", () => {
  assert.equal(inferStatusMode("Verifying"), "verifying");
  assert.equal(inferStatusMode("verifying"), "verifying");
  assert.equal(inferStatusMode("In Review"), "verifying");
  assert.equal(inferStatusMode("Ready for Review"), "verifying");
});

test("inferStatusMode tags In Progress tickets", () => {
  assert.equal(inferStatusMode("In Progress"), "in-progress");
  assert.equal(inferStatusMode("in-progress"), "in-progress");
});

test("inferStatusMode defaults unknown to 'unknown'", () => {
  assert.equal(inferStatusMode(""), "unknown");
  assert.equal(inferStatusMode("To Do"), "unknown");
  assert.equal(inferStatusMode("Done"), "unknown");
});

// --- User payload structure ------------------------------------------------

test("user payload includes the ticket fields and the per-mode instructions", () => {
  const payloadText = buildGenerateSummaryUserPayload({
    issueKey: "BDEV-700",
    summary: "Reconnect storm on foreground",
    status: "Verifying",
    descriptionText: "When the app foregrounds after >60s, reconnect runs multiple times.",
    acceptanceCriteria: "Only one reconnect attempt per foreground.",
    mvpTrack: "Auth",
    verificationSurface: "One Phone",
    verifiedBuildOrCommit: "65",
    loopStage: "Human Verifying",
  });
  const parsed = JSON.parse(payloadText);
  assert.equal(parsed.issue_key, "BDEV-700");
  assert.equal(parsed.ticket_status, "Verifying");
  assert.equal(parsed.verified_build_or_commit, "65");
  assert.equal(parsed.acceptance_criteria, "Only one reconnect attempt per foreground.");
  assert.equal(parsed.instructions_for_this_ticket.mode, "verifying");
  assert.equal(parsed.instructions_for_this_ticket.expected_agent_testing_value, "passed");
  assert.equal(parsed.instructions_for_this_ticket.expected_build_commit_value, "65");
  assert.match(parsed.instructions_for_this_ticket.tone, /merged and ready to test/i);
});

test("user payload tells the model 'pending' + 'inconclusive' on In Progress tickets", () => {
  const payloadText = buildGenerateSummaryUserPayload({
    issueKey: "BDEV-701",
    summary: "BLE peer count off by one",
    status: "In Progress",
    descriptionText: "Description with no build named.",
    acceptanceCriteria: "",
    mvpTrack: "BLE",
    verificationSurface: "Two Phones",
    verifiedBuildOrCommit: "",
    loopStage: "Agent Coding",
  });
  const parsed = JSON.parse(payloadText);
  assert.equal(parsed.instructions_for_this_ticket.mode, "in-progress");
  assert.equal(parsed.instructions_for_this_ticket.expected_agent_testing_value, "inconclusive");
  assert.equal(parsed.instructions_for_this_ticket.expected_build_commit_value, "pending");
  assert.match(parsed.instructions_for_this_ticket.tone, /work in progress|placeholder/i);
});

test("user payload falls back to placeholders when description is empty", () => {
  const payloadText = buildGenerateSummaryUserPayload({
    issueKey: "BDEV-702",
    summary: "Nothing here",
    status: "Verifying",
    descriptionText: "",
    acceptanceCriteria: "",
    mvpTrack: "",
    verificationSurface: "",
    verifiedBuildOrCommit: "",
    loopStage: "",
  });
  const parsed = JSON.parse(payloadText);
  assert.match(parsed.ticket_description, /no description/i);
  assert.match(parsed.acceptance_criteria, /none extracted/i);
  assert.equal(parsed.mvp_track, "(unset)");
  assert.equal(parsed.verification_surface, "(unset)");
  assert.equal(parsed.verified_build_or_commit, "(not set)");
});

// --- looksLikeAgentTestUpdate ---------------------------------------------

test("looksLikeAgentTestUpdate accepts a well-formed body", () => {
  const body = [
    "Agent Test Update",
    "",
    "Agent testing: passed",
    "Build/commit: build 65",
    "Human verification needed: yes",
    "Automated: Passed",
    "Simulator: N/A — backend-only fix",
    "Worker smoke: Passed",
    "",
    "Human test requested:",
    "1. Open the app cold.",
    "2. Background it for 90s, then foreground.",
    "3. Pass when only one reconnect line appears in the log.",
    "",
    "Evidence:",
    "- One reconnect line in build 65 staging logs.",
  ].join("\n");
  assert.equal(looksLikeAgentTestUpdate(body), true);
});

test("looksLikeAgentTestUpdate rejects an output missing the heading", () => {
  const body = [
    "Agent testing: passed",
    "Build/commit: build 65",
    "Human verification needed: yes",
  ].join("\n");
  assert.equal(looksLikeAgentTestUpdate(body), false);
});

test("looksLikeAgentTestUpdate rejects an output missing the labeled values", () => {
  assert.equal(looksLikeAgentTestUpdate("Agent Test Update\n\nHere is some prose only."), false);
});

// --- unwrapOuterCodeFence --------------------------------------------------

test("unwrapOuterCodeFence strips a wrapping ```markdown fence", () => {
  const raw = "```markdown\nAgent Test Update\n\nAgent testing: passed\nBuild/commit: build 65\n```";
  const unwrapped = unwrapOuterCodeFence(raw);
  assert.match(unwrapped, /^Agent Test Update/);
  assert.doesNotMatch(unwrapped, /```/);
});

test("unwrapOuterCodeFence leaves a bare body alone", () => {
  const raw = "Agent Test Update\n\nAgent testing: passed\nBuild/commit: build 65";
  assert.equal(unwrapOuterCodeFence(raw), raw);
});

test("unwrapOuterCodeFence preserves inline ``` blocks (e.g. inside Evidence)", () => {
  const raw = "Agent Test Update\n\nAgent testing: passed\nBuild/commit: build 65\n\nEvidence:\n```\nlog line\n```";
  const unwrapped = unwrapOuterCodeFence(raw);
  assert.ok(unwrapped.includes("```\nlog line\n```"), "inline code fence stripped by mistake");
});

// --- Dedup cache -----------------------------------------------------------

test("generation cache returns the cached body within 30s and expires after", () => {
  const key = "generate:BDEV-704";
  const now = 1_700_000_000_000;
  setCachedGeneration(key, { status: "ready", commentId: "c1" }, now);
  assert.deepEqual(getCachedGeneration(key, now + 10_000), {
    status: "ready",
    commentId: "c1",
  });
  // After TTL, the cache evicts and returns null.
  assert.equal(getCachedGeneration(key, now + 60_000), null);
});

test("generation cache returns null for an unknown key", () => {
  assert.equal(getCachedGeneration("generate:UNKNOWN", Date.now()), null);
});

test("in-flight lock blocks a second tap during a long OpenRouter call", () => {
  const key = "generate:BDEV-705";
  const now = 1_700_000_000_000;
  // No lock initially.
  assert.equal(isGenerationInFlight(key, now), false);
  // First tap takes the lock.
  markGenerationInFlight(key, now);
  assert.equal(isGenerationInFlight(key, now + 5_000), true);
  // Second tap 5s later still sees the lock — would 409 in the route.
  assert.equal(isGenerationInFlight(key, now + 5_000), true);
  // Tap releases the lock at the end of its handler (try/finally).
  clearGenerationInFlight(key);
  assert.equal(isGenerationInFlight(key, now + 5_000), false);
});

test("in-flight lock auto-expires after 60s so a stuck handler doesn't block forever", () => {
  const key = "generate:BDEV-706";
  const now = 1_700_000_000_000;
  markGenerationInFlight(key, now);
  // Inside the TTL: still locked.
  assert.equal(isGenerationInFlight(key, now + 30_000), true);
  // Past the 60s TTL: the lock auto-clears even if the original
  // handler never reached its finally block (server restart, crash).
  assert.equal(isGenerationInFlight(key, now + 60_001), false);
});
