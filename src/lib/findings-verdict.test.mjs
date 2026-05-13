import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFindingsSystemPrompt,
  buildFindingsUserPayload,
  buildHumanTestResultComment,
  buildLocalVerdictFallback,
  hashFindings,
  parseFindingsVerdict,
  recommendationLabel,
} from "./findings-verdict.ts";
import { extractHumanTestResults } from "./mvp-ticket-checklist.ts";

// --- System prompt sanity --------------------------------------------------

test("system prompt mentions conservatism + plain English + JSON output", () => {
  const prompt = buildFindingsSystemPrompt();
  assert.match(prompt, /conservative/i);
  assert.match(prompt, /JSON/i);
  assert.match(prompt, /plain English/i);
  assert.match(prompt, /pass criteria/i);
  assert.match(prompt, /fail criteria/i);
  assert.match(prompt, /inconclusive criteria/i);
  // The reader is a non-coder — the prompt should warn against "looks fine".
  assert.match(prompt, /looks fine|seems okay/i);
});

// --- User payload structure ------------------------------------------------

test("user payload includes findings, evidence, build, and Sentry IDs", () => {
  const payloadText = buildFindingsUserPayload({
    issueKey: "BDEV-352",
    summary: "WS reconnect storm on foreground",
    acceptanceCriteria: "Only one reconnect attempt per foreground.",
    agentTestUpdate: "Status: passed; Build/commit: 67",
    buildOrCommit: "67",
    findings: "I backgrounded the app, came back, one reconnect line.",
    evidence: "APPLE-IOS-42 dropped to zero.",
    surfacePassFail: [{ label: "On Phone", value: "pass" }],
    sentryIds: ["APPLE-IOS-42"],
  });
  const parsed = JSON.parse(payloadText);
  assert.equal(parsed.issue_key, "BDEV-352");
  assert.equal(parsed.build_or_commit_under_test, "67");
  assert.ok(parsed.human_findings.includes("backgrounded"));
  assert.deepEqual(parsed.sentry_ids_in_evidence, ["APPLE-IOS-42"]);
  assert.equal(parsed.acceptance_criteria, "Only one reconnect attempt per foreground.");
});

// --- Verdict parsing -------------------------------------------------------

test("parseFindingsVerdict handles a clean pass JSON", () => {
  const text = JSON.stringify({
    verdict: "pass",
    reasoning: "The app reconnected once and the Sentry ID dropped.",
    next_step: "Mark done.",
    evidence_supports_fix: true,
    concerns: [],
  });
  const verdict = parseFindingsVerdict(text);
  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.evidence_supports_fix, true);
  assert.match(verdict.reasoning, /reconnected/);
});

test("parseFindingsVerdict strips ```json fences", () => {
  const text = "```json\n" + JSON.stringify({ verdict: "fail", reasoning: "Three reconnects observed.", next_step: "Reopen.", evidence_supports_fix: false, concerns: ["3 reconnects in log"] }) + "\n```";
  const verdict = parseFindingsVerdict(text);
  assert.equal(verdict.verdict, "fail");
  assert.deepEqual(verdict.concerns, ["3 reconnects in log"]);
});

test("parseFindingsVerdict normalises verdict aliases (passed/failed)", () => {
  const passed = parseFindingsVerdict(JSON.stringify({ verdict: "Passed", reasoning: "ok", next_step: "go" }));
  assert.equal(passed.verdict, "pass");
  const failed = parseFindingsVerdict(JSON.stringify({ verdict: "FAILED", reasoning: "bad", next_step: "reopen" }));
  assert.equal(failed.verdict, "fail");
});

test("parseFindingsVerdict returns 'inconclusive' on malformed JSON instead of throwing", () => {
  const verdict = parseFindingsVerdict("this is not json at all {not really{");
  assert.equal(verdict.verdict, "inconclusive");
  assert.match(verdict.reasoning, /AI couldn't return a clean answer/i);
});

// --- Local fallback (the 4 synthetic cases) --------------------------------

test("local fallback marks BDEV-352-style precise findings as inconclusive (no AI)", () => {
  // Per spec: when OpenRouter isn't configured, ALL fallback verdicts
  // are "inconclusive" so the human has to pick a button manually. The
  // four synthetic cases below verify the *prompt* via system prompt
  // checks; the fallback verdicts are deterministic.
  const verdict = buildLocalVerdictFallback({
    issueKey: "BDEV-352",
    summary: "WS reconnect storm on foreground",
    acceptanceCriteria: "Only one reconnect attempt per foreground.",
    agentTestUpdate: "Status: passed",
    buildOrCommit: "67",
    findings: "I backgrounded and foregrounded the app, only saw one reconnect line in the log.",
    evidence: "",
    surfacePassFail: [],
    sentryIds: [],
  });
  assert.equal(verdict.verdict, "inconclusive");
  assert.match(verdict.reasoning, /No AI/);
});

test("local fallback flags vague 'seems okay' findings", () => {
  const verdict = buildLocalVerdictFallback({
    issueKey: "BDEV-352",
    summary: "WS reconnect storm",
    acceptanceCriteria: "",
    agentTestUpdate: "",
    buildOrCommit: "67",
    findings: "I tested it and it seems okay.",
    evidence: "",
    surfacePassFail: [],
    sentryIds: [],
  });
  assert.equal(verdict.verdict, "inconclusive");
  assert.match(verdict.reasoning, /too vague/i);
});

test("local fallback flags missing findings as vague", () => {
  const verdict = buildLocalVerdictFallback({
    issueKey: "BDEV-352",
    summary: "WS reconnect storm",
    acceptanceCriteria: "",
    agentTestUpdate: "",
    buildOrCommit: "67",
    findings: "",
    evidence: "",
    surfacePassFail: [],
    sentryIds: [],
  });
  assert.equal(verdict.verdict, "inconclusive");
});

test("recommendationLabel maps verdicts to action button copy", () => {
  assert.equal(recommendationLabel("pass"), "Mark Done");
  assert.equal(recommendationLabel("fail"), "Reopen for fix");
  assert.equal(recommendationLabel("inconclusive"), "Needs more info");
});

// --- Synthetic-case behavior expected from a real AI --------------------------

// These 4 cases come from the spec. We can't exercise the AI inline, but
// we CAN assert that a well-formed AI response in each shape parses
// correctly and routes to the right recommendation.
test("synthetic case 1 (precise pass): pass JSON routes to Mark Done", () => {
  const aiResponse = JSON.stringify({
    verdict: "pass",
    reasoning: "The reconnect line only fired once after foregrounding, which matches the fix.",
    next_step: "Mark this done.",
    evidence_supports_fix: true,
    concerns: [],
  });
  const verdict = parseFindingsVerdict(aiResponse);
  assert.equal(verdict.verdict, "pass");
  assert.equal(recommendationLabel(verdict.verdict), "Mark Done");
});

test("synthetic case 2 (vague): inconclusive JSON routes to Needs more info", () => {
  const aiResponse = JSON.stringify({
    verdict: "inconclusive",
    reasoning: "The note 'seems okay' doesn't say how many reconnect lines appeared, so we can't confirm the fix.",
    next_step: "Re-test and count the reconnect lines explicitly.",
    evidence_supports_fix: null,
    concerns: ["Reconnect-count evidence missing"],
  });
  const verdict = parseFindingsVerdict(aiResponse);
  assert.equal(verdict.verdict, "inconclusive");
  assert.equal(recommendationLabel(verdict.verdict), "Needs more info");
});

test("synthetic case 3 (contradicts fix): fail JSON routes to Reopen for fix", () => {
  const aiResponse = JSON.stringify({
    verdict: "fail",
    reasoning: "Three reconnect lines after one foreground — the fix didn't take.",
    next_step: "Reopen so the AI can take another pass.",
    evidence_supports_fix: false,
    concerns: ["3 reconnect events visible in log"],
  });
  const verdict = parseFindingsVerdict(aiResponse);
  assert.equal(verdict.verdict, "fail");
  assert.equal(recommendationLabel(verdict.verdict), "Reopen for fix");
});

test("synthetic case 4 (log contradicts fix): fail with concrete log excerpt", () => {
  const aiResponse = JSON.stringify({
    verdict: "fail",
    reasoning: "The log excerpt shows the same auth retry storm the fix was meant to stop.",
    next_step: "Reopen — share the log excerpt with the next AI.",
    evidence_supports_fix: false,
    concerns: ["Retry loop visible in pasted log lines 12-18"],
  });
  const verdict = parseFindingsVerdict(aiResponse);
  assert.equal(verdict.verdict, "fail");
  assert.ok(verdict.concerns.length > 0);
});

// --- Human Test Result comment shape ---------------------------------------

test("buildHumanTestResultComment includes 'build N' so the Mark verified validator passes", () => {
  const comment = buildHumanTestResultComment({
    buildOrCommit: "67",
    outcome: "pass",
    verifier: "macca.mck@gmail.com",
    findings: "I backgrounded the app and only saw one reconnect.",
    evidence: "APPLE-IOS-42 dropped to zero.",
    aiVerdict: {
      verdict: "pass",
      reasoning: "Reconnect happened once.",
      next_step: "Mark done.",
      evidence_supports_fix: true,
      concerns: [],
    },
  });
  // Header.
  assert.match(comment, /^Human Test Result/);
  // Build line is "Tested on: build 67" — used to mirror the existing
  // "Build/commit:" pattern when downstream code (extractHumanTestResults)
  // reads back. Also satisfies the validator's "build N" check when
  // re-pasted into the verification comment.
  assert.match(comment, /Tested on: build 67/);
  assert.match(comment, /Outcome: pass/);
  assert.match(comment, /Findings:\s*\nI backgrounded the app/);
  assert.match(comment, /Evidence:\s*\n```\nAPPLE-IOS-42 dropped/);
  assert.match(comment, /Recommendation: Mark Done/);
  assert.match(comment, /Reasoning: Reconnect happened once\./);
  assert.match(comment, /Next step: Mark done\./);
});

test("buildHumanTestResultComment handles empty evidence cleanly", () => {
  const comment = buildHumanTestResultComment({
    buildOrCommit: "",
    outcome: "inconclusive",
    verifier: "John",
    findings: "Not sure yet.",
    evidence: "",
    aiVerdict: {
      verdict: "inconclusive",
      reasoning: "Findings too vague to map to acceptance.",
      next_step: "Try again with more detail.",
      evidence_supports_fix: null,
      concerns: ["No evidence"],
    },
  });
  assert.match(comment, /Tested on: build not specified/);
  assert.match(comment, /Evidence:\s*\n\(none provided\)/);
  assert.match(comment, /- Concerns:\s*\n {2}- No evidence/);
});

// --- Cache key hashing -----------------------------------------------------

test("hashFindings produces a stable, distinct hash per content", () => {
  const a = hashFindings("one reconnect line", "");
  const b = hashFindings("one reconnect line", "");
  const c = hashFindings("three reconnect lines", "");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// --- extractHumanTestResults symmetric parser ------------------------------

function makeCommentFromBuilder(comment) {
  return {
    id: comment.id,
    author: comment.author,
    created: comment.created,
    // The lib expects the text-only form (post-ADF parse), so we pass
    // the raw text built by buildHumanTestResultComment directly.
    text: comment.text,
  };
}

test("extractHumanTestResults parses a single Human Test Result back into the view model", () => {
  const text = buildHumanTestResultComment({
    buildOrCommit: "67",
    outcome: "pass",
    verifier: "macca.mck@gmail.com",
    findings: "Only one reconnect line in the log.",
    evidence: "APPLE-IOS-42 dropped to zero.",
    aiVerdict: {
      verdict: "pass",
      reasoning: "The fix worked.",
      next_step: "Mark done.",
      evidence_supports_fix: true,
      concerns: [],
    },
  });

  const results = extractHumanTestResults([
    makeCommentFromBuilder({
      id: "c-1",
      author: "macca.mck@gmail.com",
      created: "2026-05-13T10:00:00Z",
      text,
    }),
  ]);

  assert.equal(results.length, 1);
  const result = results[0];
  assert.equal(result.outcome, "pass");
  assert.equal(result.buildOrCommit, "build 67");
  assert.match(result.findings, /Only one reconnect line/);
  assert.match(result.evidence, /APPLE-IOS-42/);
  assert.equal(result.aiRecommendation, "Mark Done");
  assert.equal(result.aiReasoning, "The fix worked.");
});

test("extractHumanTestResults returns multiple results sorted newest first", () => {
  const older = buildHumanTestResultComment({
    buildOrCommit: "65",
    outcome: "fail",
    verifier: "John",
    findings: "Three reconnects.",
    evidence: "",
    aiVerdict: {
      verdict: "fail",
      reasoning: "Saw three reconnect lines.",
      next_step: "Reopen.",
      evidence_supports_fix: false,
      concerns: [],
    },
  });
  const newer = buildHumanTestResultComment({
    buildOrCommit: "67",
    outcome: "pass",
    verifier: "John",
    findings: "Only one reconnect on the new build.",
    evidence: "",
    aiVerdict: {
      verdict: "pass",
      reasoning: "Fix verified on build 67.",
      next_step: "Mark done.",
      evidence_supports_fix: true,
      concerns: [],
    },
  });

  const results = extractHumanTestResults([
    makeCommentFromBuilder({
      id: "c-old",
      author: "John",
      created: "2026-05-10T09:00:00Z",
      text: older,
    }),
    makeCommentFromBuilder({
      id: "c-new",
      author: "John",
      created: "2026-05-13T14:00:00Z",
      text: newer,
    }),
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0].commentId, "c-new");
  assert.equal(results[0].outcome, "pass");
  assert.equal(results[1].commentId, "c-old");
  assert.equal(results[1].outcome, "fail");
});

test("extractHumanTestResults ignores comments that aren't Human Test Result", () => {
  const results = extractHumanTestResults([
    {
      id: "agent-1",
      author: "AI",
      created: "2026-05-13T08:00:00Z",
      text: "Agent Test Update\nStatus: passed\nBuild/commit: 67",
    },
    {
      id: "chat-1",
      author: "John",
      created: "2026-05-13T09:00:00Z",
      text: "lgtm",
    },
  ]);
  assert.equal(results.length, 0);
});
