import test from "node:test";
import assert from "node:assert/strict";

import {
  adfToPlainText,
  buildChecklistViewModel,
  getRecommendedAction,
  normalizeIssueKey,
} from "./mvp-ticket-checklist.ts";
import {
  buildQueueJql,
  isTestable,
  normaliseCandidate,
  rankCandidates,
} from "./ticket-queue.ts";

function makeRawCandidate({ key = "BDEV-100", fields = {} } = {}) {
  return {
    key,
    fields: {
      summary: "[AUTH] Token refresh storm",
      status: { name: "Verifying" },
      priority: { name: "High" },
      updated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      statuscategorychangedate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      issuelinks: [],
      customfield_10043: { value: "Auth" },
      customfield_10044: { value: "Human Verifying" },
      customfield_10045: { value: "Automated, Simulator, One Phone" },
      customfield_10046: { value: "Ready" },
      customfield_10047: "62",
      ...fields,
    },
  };
}

test("buildQueueJql excludes done tickets and uses BDEV", () => {
  const jql = buildQueueJql();
  assert.match(jql, /project = BDEV/);
  assert.match(jql, /statusCategory != "Done"/);
  assert.match(jql, /Verifying/);
});

test("normaliseCandidate maps custom fields and status", () => {
  const c = normaliseCandidate(makeRawCandidate());
  assert.equal(c.issueKey, "BDEV-100");
  assert.equal(c.status, "Verifying");
  assert.equal(c.priority, "High");
  assert.equal(c.mvpTrack, "Auth");
  assert.equal(c.loopStage, "Human Verifying");
  assert.equal(c.humanFinalReview, "Ready");
  assert.equal(c.verifiedBuildOrCommit, "62");
});

test("normaliseCandidate skips done/closed candidates", () => {
  assert.equal(
    normaliseCandidate(
      makeRawCandidate({ fields: { status: { name: "Done" } } }),
    ),
    null,
  );
});

test("isTestable filters out passed Human Final Review", () => {
  const c = normaliseCandidate(
    makeRawCandidate({ fields: { customfield_10046: { value: "Passed" } } }),
  );
  assert.equal(isTestable(c), false);
});

test("isTestable filters out In Progress tickets with no readiness evidence", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        status: { name: "In Progress" },
        customfield_10044: { value: "Candidate" },
        customfield_10046: { value: "Not Ready" },
        customfield_10047: "Not set",
      },
    }),
  );
  assert.equal(isTestable(c), false);
});

test("isTestable keeps In Progress tickets that have a build named", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        status: { name: "In Progress" },
        customfield_10044: { value: "Agent Coding" },
        customfield_10046: { value: "Not Ready" },
        customfield_10047: "62",
      },
    }),
  );
  assert.equal(isTestable(c), true);
});

test("isTestable keeps Verifying tickets even with no other evidence", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        status: { name: "Verifying" },
        customfield_10044: { value: "" },
        customfield_10046: { value: "" },
        customfield_10047: "",
      },
    }),
  );
  assert.equal(isTestable(c), true);
});

test("rankCandidates pushes older Verifying tickets to the top", () => {
  const fresh = normaliseCandidate(makeRawCandidate({ key: "BDEV-FRESH" }));
  const stale = normaliseCandidate(
    makeRawCandidate({
      key: "BDEV-STALE",
      fields: {
        statuscategorychangedate: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
        updated: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      },
    }),
  );
  const rows = rankCandidates({ candidates: [fresh, stale] });
  assert.equal(rows[0].issueKey, "BDEV-STALE");
  assert.ok(rows[0].reasons.some((r) => /stale|Sitting/i.test(r)));
});

test("rankCandidates rewards downstream blockers", () => {
  const plain = normaliseCandidate(makeRawCandidate({ key: "BDEV-A" }));
  const blocker = normaliseCandidate(
    makeRawCandidate({
      key: "BDEV-B",
      fields: {
        issuelinks: [
          {
            type: { name: "Blocks", outward: "blocks", inward: "is blocked by" },
            outwardIssue: { key: "BDEV-X" },
          },
          {
            type: { name: "Blocks" },
            outwardIssue: { key: "BDEV-Y" },
          },
        ],
      },
    }),
  );
  const rows = rankCandidates({ candidates: [plain, blocker] });
  assert.equal(rows[0].issueKey, "BDEV-B");
  assert.ok(rows[0].blocksKeys.length === 2);
  assert.ok(rows[0].reasons.some((r) => /Blocks 2/.test(r)));
});

test("rankCandidates penalises recently-loaded tickets so they fall down the list", () => {
  const a = normaliseCandidate(makeRawCandidate({ key: "BDEV-A" }));
  const b = normaliseCandidate(makeRawCandidate({ key: "BDEV-B" }));
  const ranked = rankCandidates({
    candidates: [a, b],
    recentlyLoadedKeys: new Set(["BDEV-A"]),
  });
  assert.equal(ranked[0].issueKey, "BDEV-B");
  assert.ok(ranked[1].reasons.some((r) => /recently opened/i.test(r)));
});

test("rankCandidates surfaces build name when one is set", () => {
  const c = normaliseCandidate(makeRawCandidate());
  const [row] = rankCandidates({ candidates: [c] });
  assert.ok(row.hasBuild);
  assert.ok(row.reasons.some((r) => /build 62/.test(r)));
});

test("normalizes BDEV issue keys and rejects unsafe input", () => {
  assert.equal(normalizeIssueKey(" bdev-493 "), "BDEV-493");
  assert.equal(normalizeIssueKey("BDEV-493?token=oops"), null);
});

test("converts Jira document bodies into readable plain text", () => {
  assert.equal(
    adfToPlainText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Lock acceptance" },
            { type: "hardBreak" },
            { type: "text", text: "before coding." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "No Jira writes" }] }],
            },
          ],
        },
      ],
    }),
    "Lock acceptance\nbefore coding.\n- No Jira writes",
  );
});

test("preserves ordered-list numbering and code marks in ADF", () => {
  // Used by the "Human test requested" panel: ordered lists become
  // "1. ", "2. " items, code-marked text gets backticks so the UI can
  // render it as inline code without a self-describing format.
  const out = adfToPlainText({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Human test requested", marks: [{ type: "strong" }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { order: 1 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "One Phone", marks: [{ type: "em" }] },
                  { type: "text", text: " — install build " },
                  { type: "text", text: "97e6ddc", marks: [{ type: "code" }] },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Sentry Watch — APPLE-IOS-4K should drop." }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(
    out,
    "Human test requested\n1. One Phone — install build `97e6ddc`.\n\n2. Sentry Watch — APPLE-IOS-4K should drop.",
  );
});

test("recommends locking acceptance before coding when the loop stage is early", () => {
  const action = getRecommendedAction({
    issueKey: "BDEV-493",
    summary: "Auth-token lifecycle stabilization",
    stage: "Selected",
    humanReview: "Not Ready",
    verificationSurface: "Automated, Simulator",
    verifiedBuildOrCommit: "",
  });

  assert.match(action.title, /Lock acceptance/i);
  assert.match(action.body, /BDEV-493/);
  assert.ok(action.steps.some((step) => step.includes("auth-token lifecycle")));
});

test("builds read-only checklist state from Jira custom fields and evidence", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-493",
    summary: "Auth-token lifecycle stabilization",
    status: "In Progress",
    descriptionText: "Acceptance: tokens refresh without silently logging users out.",
    customFields: {
      mvpTrack: "Text Core",
      loopStage: "Agent Coding",
      verificationSurface: "Automated, Simulator",
      humanFinalReview: "Not Ready",
      verifiedBuildOrCommit: "abc1234",
    },
    comments: [
      {
        id: "1",
        author: "John",
        created: "2026-05-04T01:00:00.000+0000",
        text: "Evidence: npm run lint passed.",
      },
    ],
    links: [{ key: "BDEV-407", relationship: "blocks", summary: "Push root", status: "Open" }],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-493",
  });

  assert.equal(viewModel.fields.loopStage.value, "Agent Coding");
  assert.equal(viewModel.checklistSections[0].items[0].checked, true);
  assert.ok(viewModel.commentTemplates[0].body.includes("BDEV-493"));
  assert.ok(viewModel.codingAgentPrompt.includes("JIRA_BASE_URL"));
  assert.ok(viewModel.codingAgentPrompt.includes("Pick up BDEV-493"));
  assert.ok(viewModel.codingAgentPrompt.includes("Agent Test Update template"));
  assert.ok(viewModel.codingAgentPrompt.includes("Do not merge your PR"));
});

test("generates missing proof steps from verification surfaces when no recipe exists", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-494",
    summary: "JWT timeout fallback cleanup",
    status: "To Do",
    descriptionText: "Acceptance: fallback alerts do not spam users.",
    customFields: {
      mvpTrack: "Auth",
      loopStage: "Selected",
      verificationSurface: "Automated, Simulator, Worker Smoke, Sentry Watch",
      humanFinalReview: "Not Ready",
      verifiedBuildOrCommit: "",
    },
    comments: [],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-494",
  });

  assert.ok(viewModel.proofRecipe.missingCount >= 4);
  assert.ok(viewModel.proofRecipe.requirements.some((item) => item.surface === "Automated"));
  assert.ok(
    viewModel.checklistSections
      .find((section) => section.title === "Verification Plan")
      .items.some((item) => item.label.includes("worker smoke") && item.checked === false),
  );
  assert.ok(viewModel.commentTemplates.some((template) => template.body.includes("MVP proof recipe")));
});

test("generates an auth-specific work recipe from track and surfaces", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-494",
    summary: "JWT timeout/offline fallback alerts need severity and backoff cleanup on build 59",
    status: "To Do",
    descriptionText: "Acceptance: fallback alerts do not spam users.",
    customFields: {
      mvpTrack: "Auth",
      loopStage: "Human Verifying",
      verificationSurface: "Automated, Simulator, One Phone, Sentry Watch",
      humanFinalReview: "Ready",
      verifiedBuildOrCommit: "build 59",
    },
    comments: [],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-494",
  });

  assert.equal(viewModel.workRecipe.kind, "Auth");
  assert.equal(viewModel.workRecipe.proofAuthority.agentMayClaimDone, false);
  assert.equal(viewModel.workRecipe.proofAuthority.level, "human-real-phone-required");
  assert.equal(viewModel.workRecipe.aiOperatingModel.mode, "human-alignment");
  assert.ok(viewModel.workRecipe.aiOperatingModel.promptRules.some((rule) => rule.includes("vertical slice")));
  assert.ok(viewModel.workRecipe.surfaceCards.some((card) => card.label === "One Phone" && card.needsHumanDevice));
  assert.equal(viewModel.humanTestPlan.canAgentFinishAlone, false);
  assert.ok(viewModel.humanTestPlan.steps.some((step) => step.title.includes("auth fallback")));
  assert.ok(viewModel.humanTestPlan.steps.some((step) => step.failMeans.includes("retry storms")));
  assert.equal(viewModel.commentTemplates[0].id, "agent-test-update");
  assert.ok(viewModel.commentTemplates[0].body.includes("Human verification needed: Yes"));
  assert.ok(viewModel.recommendedAction.steps.some((step) => step.includes("Automated, Simulator, One Phone, Sentry Watch")));
  assert.ok(
    viewModel.checklistSections
      .find((section) => section.title === "Agent Guardrails")
      .items.some((item) => item.label.includes("auth state cleanup")),
  );
});

test("generates BLE/Nearby-specific checklist details", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-500",
    summary: "Nearby friend count does not match BLE mesh peers after accepting friend request",
    status: "Selected",
    descriptionText: "",
    customFields: {
      mvpTrack: "Nearby/BLE",
      loopStage: "Selected",
      verificationSurface: "Two Phones, BLE",
      humanFinalReview: "Not Ready",
      verifiedBuildOrCommit: "",
    },
    comments: [],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-500",
  });

  assert.equal(viewModel.workRecipe.kind, "Nearby/BLE");
  assert.ok(viewModel.workRecipe.acceptanceQuestions.some((question) => question.includes("raw mesh peer count")));
  assert.ok(viewModel.codingAgentPrompt.includes("Do not close a BLE/Nearby ticket from simulator evidence alone"));
});

test("lets agents claim done only when proof surfaces are automated or simulator", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-501",
    summary: "Notification tap route opens the wrong app tab in simulator",
    status: "Verifying",
    descriptionText: "Acceptance: simulator cold launch routes to the Friends panel.",
    customFields: {
      mvpTrack: "Push/Badge",
      loopStage: "Human Verifying",
      verificationSurface: "Automated, Simulator",
      humanFinalReview: "Ready",
      verifiedBuildOrCommit: "abc123",
    },
    comments: [
      {
        id: "1",
        author: "Agent",
        created: "2026-05-04T01:00:00.000+0000",
        text: "Evidence: npm run test passed. Simulator: cold launch tap route passed.",
      },
    ],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-501",
  });

  assert.equal(viewModel.workRecipe.proofAuthority.level, "agent-can-confirm");
  assert.equal(viewModel.workRecipe.proofAuthority.agentMayClaimDone, true);
  assert.equal(viewModel.workRecipe.aiOperatingModel.mode, "agent-afk");
  assert.equal(viewModel.humanTestPlan.canAgentFinishAlone, true);
  assert.ok(viewModel.humanTestPlan.summary.includes("agent proof"));
  assert.ok(viewModel.recommendedAction.title.includes("Review the agent proof package"));
  assert.ok(viewModel.codingAgentPrompt.includes("Agent may claim 100% done: YES"));
  assert.ok(viewModel.codingAgentPrompt.includes("fresh context"));
});

test("parses agent test updates into the human test plan", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-501",
    summary: "Notification tap route opens the wrong app tab in simulator",
    status: "Verifying",
    descriptionText: "Acceptance: simulator cold launch routes to the Friends panel.",
    customFields: {
      mvpTrack: "Push/Badge",
      loopStage: "Human Verifying",
      verificationSurface: "Automated, Simulator",
      humanFinalReview: "Ready",
      verifiedBuildOrCommit: "",
    },
    comments: [
      {
        id: "1",
        author: "Agent",
        created: "2026-05-04T01:00:00.000+0000",
        text: [
          "BDEV-501 agent test update",
          "",
          "Agent testing: Passed",
          "Automated: Passed",
          "Simulator: Passed",
          "Worker smoke: Not required",
          "Build/commit: abc123",
          "Human verification needed: No",
          "",
          "Human test requested:",
          "- Review proof package only.",
          "",
          "Evidence:",
          "- npm run test passed",
          "- Simulator cold-launch route passed",
        ].join("\n"),
      },
    ],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-501",
  });

  assert.equal(viewModel.humanTestPlan.agentUpdate.found, true);
  assert.equal(viewModel.humanTestPlan.agentUpdate.status, "passed");
  assert.equal(viewModel.humanTestPlan.agentUpdate.buildOrCommit, "abc123");
  assert.equal(viewModel.humanTestPlan.agentUpdate.surfaceResults.simulator, "Passed");
  assert.equal(viewModel.humanTestPlan.agentUpdate.humanVerificationNeeded, false);
  assert.ok(viewModel.humanTestPlan.steps[0].doThis.includes("abc123"));
});

test("parses heading-style 'Human test requested' with ordered list items and code", () => {
  // BDEV-493 has a bold heading (no colon) followed by a preamble paragraph
  // and then an ordered list — this exercises the structured panel path.
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-493",
    summary: "Auth token recovery",
    status: "To Do",
    descriptionText: "Acceptance.",
    customFields: {
      mvpTrack: "Auth",
      loopStage: "Verifying",
      verificationSurface: "Automated, Simulator, One Phone, Sentry Watch",
      humanFinalReview: "Ready",
      verifiedBuildOrCommit: "",
    },
    comments: [
      {
        id: "1",
        author: "John McKean",
        created: "2026-05-08T01:00:00.000+0000",
        text: [
          "BDEV-493 agent test update",
          "- Agent testing: Passed",
          "- Build/commit: PR #391 head 97e6ddc",
          "- Human verification needed: Yes",
          "",
          "Human test requested",
          "Verification Surface = One Phone, Sentry Watch.",
          "1. One Phone — install build `97e6ddc` and cold launch. No infinite loop.",
          "2. Sentry Watch — APPLE-IOS-4K and APPLE-IOS-4J should drop sharply.",
        ].join("\n"),
      },
    ],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-493",
  });

  const update = viewModel.humanTestPlan.agentUpdate;
  assert.equal(update.found, true);
  assert.equal(update.humanTestRequestedItems.length, 2);
  assert.equal(update.humanTestRequestedItems[0].number, 1);
  assert.equal(update.humanTestRequestedItems[0].title, "One Phone");
  assert.ok(update.humanTestRequestedItems[0].body.includes("install build"));
  // Backtick fragments survive into the segments[] for inline <code>.
  const codeSegments = update.humanTestRequestedItems[0].segments.filter((seg) => seg.kind === "code");
  assert.equal(codeSegments.length, 1);
  assert.equal(codeSegments[0].value, "97e6ddc");
  assert.equal(update.humanTestRequestedItems[1].title, "Sentry Watch");
  assert.ok(update.humanTestRequestedPreamble.includes("Verification Surface"));
  assert.deepEqual(update.sentryWatchIds.sort(), ["APPLE-IOS-4J", "APPLE-IOS-4K"]);
});

test("uses concrete proof recipe details when Jira provides them", () => {
  const viewModel = buildChecklistViewModel({
    issueKey: "BDEV-493",
    summary: "Auth token 404 recovery",
    status: "Selected",
    descriptionText: "Acceptance: token 404 follows deterministic recovery.",
    customFields: {
      mvpTrack: "Auth",
      loopStage: "Selected",
      verificationSurface: "Automated, Simulator",
      humanFinalReview: "Not Ready",
      verifiedBuildOrCommit: "",
    },
    comments: [
      {
        id: "1",
        author: "John",
        created: "2026-05-04T01:00:00.000+0000",
        text: [
          "BDEV-493 MVP proof recipe",
          "Required proof steps:",
          "Automated:",
          "- Command: swift test --filter AuthToken404RecoveryTests",
          "- Expected result: no retry storm",
          "Simulator:",
          "- Scenario: launch after mocked token 404 and confirm recovery state",
        ].join("\n"),
      },
    ],
    links: [],
    issueUrl: "https://heyblip.atlassian.net/browse/BDEV-493",
  });

  assert.equal(viewModel.proofRecipe.foundStructuredRecipe, true);
  assert.ok(viewModel.proofRecipe.requirements.find((item) => item.surface === "Automated").hasConcreteProof);
  assert.ok(viewModel.codingAgentPrompt.includes("AuthToken404RecoveryTests"));
});
