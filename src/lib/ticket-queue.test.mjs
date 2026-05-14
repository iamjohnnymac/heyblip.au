// Focused tests for the three new fields added for the /queue page:
//   - labels (Jira `labels` array)
//   - hasAgentTestUpdate (any comment matches /agent test update/i)
//   - hasHumanTestResult (any comment matches /human test result/i)
//
// The broader normalisation + ranking behaviour is already exercised in
// mvp-ticket-checklist.test.mjs; this file only covers the new surface so
// regressions get caught without dragging the larger suite into queue work.

import test from "node:test";
import assert from "node:assert/strict";

import { buildQueueJql, classifyWorkArea, isTestable, normaliseCandidate, QUEUE_FIELDS } from "./ticket-queue.ts";

function makeRawCandidate({ key = "BDEV-700", fields = {} } = {}) {
  return {
    key,
    fields: {
      summary: "Queue field smoke test",
      status: { name: "Verifying" },
      priority: { name: "High" },
      updated: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      statuscategorychangedate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      issuelinks: [],
      customfield_10043: { value: "Push" },
      customfield_10044: { value: "Human Verifying" },
      customfield_10045: { value: "One Phone" },
      customfield_10046: { value: "Ready" },
      customfield_10047: "65",
      ...fields,
    },
  };
}

test("QUEUE_FIELDS asks Jira for labels and comments", () => {
  // The /queue page needs both to render launch-blocker pills and the
  // "AI summary / Human result" hints — the route adds these to the field
  // mask sent to Jira's search/jql endpoint.
  assert.ok(QUEUE_FIELDS.includes("labels"), "labels missing from QUEUE_FIELDS");
  assert.ok(QUEUE_FIELDS.includes("comment"), "comment missing from QUEUE_FIELDS");
});

test("normaliseCandidate populates labels from Jira input", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: { labels: ["launch-blocker", "p1", "needs-design"] },
    }),
  );
  assert.deepEqual(c.labels, ["launch-blocker", "p1", "needs-design"]);
});

test("normaliseCandidate returns an empty labels array when Jira omits the field", () => {
  const c = normaliseCandidate(makeRawCandidate());
  assert.deepEqual(c.labels, []);
});

test("normaliseCandidate detects hasAgentTestUpdate from comments", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [
            {
              body: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "BDEV-700 Agent Test Update — passed" }],
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
  assert.equal(c.hasAgentTestUpdate, true);
  assert.equal(c.hasHumanTestResult, false);
});

test("normaliseCandidate detects hasHumanTestResult from comments", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [
            {
              body: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Human Test Result: passed on build 65" }],
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
  assert.equal(c.hasHumanTestResult, true);
  assert.equal(c.hasAgentTestUpdate, false);
});

test("normaliseCandidate handles missing comments field gracefully", () => {
  // Jira sometimes omits the `comment` field entirely on tickets with no
  // activity — the candidate should still normalise cleanly with both
  // booleans defaulting to false.
  const c = normaliseCandidate(makeRawCandidate());
  assert.equal(c.hasAgentTestUpdate, false);
  assert.equal(c.hasHumanTestResult, false);
});

test("normaliseCandidate accepts plain-string comment bodies", () => {
  // Belt-and-braces: if a comment ever comes through as plain text instead
  // of ADF (older API revisions, test fixtures), the detector still fires.
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [{ body: "Some Agent Test Update body" }],
        },
      },
    }),
  );
  assert.equal(c.hasAgentTestUpdate, true);
});

test("normaliseCandidate finds the marker in any comment, not just the first", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [
            { body: "Just a chat comment, nothing structured." },
            { body: "Some Human Test Result was logged here." },
          ],
        },
      },
    }),
  );
  assert.equal(c.hasHumanTestResult, true);
});

// --- buildQueueJql: includes To Do for the backlog section ---------------

test("buildQueueJql includes 'To Do' so the backlog section can render", () => {
  const jql = buildQueueJql();
  assert.match(jql, /"To Do"/);
  assert.match(jql, /"In Progress"/);
  assert.match(jql, /"Verifying"/);
  assert.match(jql, /"Selected"/);
});

test("buildQueueJql excludes Epics so they don't pollute the backlog", () => {
  const jql = buildQueueJql();
  assert.match(jql, /issuetype\s*!=\s*"Epic"/i);
});

// --- agentTestUpdateStatus: parses the labelled value from the comment ---

test("normaliseCandidate parses agentTestUpdateStatus=passed from Agent Test Update", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [
            {
              body: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "## Agent Test Update\n\nAgent testing: passed\nBuild/commit: build 67" }],
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
  assert.equal(c.hasAgentTestUpdate, true);
  assert.equal(c.agentTestUpdateStatus, "passed");
});

test("normaliseCandidate parses agentTestUpdateStatus=inconclusive for preview-style summaries", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [
            { body: "## Agent Test Update\n\nAgent testing: inconclusive\nBuild/commit: pending" },
          ],
        },
      },
    }),
  );
  assert.equal(c.agentTestUpdateStatus, "inconclusive");
});

test("normaliseCandidate parses agentTestUpdateStatus=failed", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [{ body: "## Agent Test Update\nAgent testing: failed\n" }],
        },
      },
    }),
  );
  assert.equal(c.agentTestUpdateStatus, "failed");
});

test("normaliseCandidate defaults agentTestUpdateStatus=unknown when no summary present", () => {
  const c = normaliseCandidate(makeRawCandidate({ fields: { comment: { comments: [] } } }));
  assert.equal(c.hasAgentTestUpdate, false);
  assert.equal(c.agentTestUpdateStatus, "unknown");
});

test("normaliseCandidate returns agentTestUpdateStatus=unknown when summary lacks a status line", () => {
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        comment: {
          comments: [{ body: "## Agent Test Update\nNo status line here." }],
        },
      },
    }),
  );
  assert.equal(c.hasAgentTestUpdate, true);
  assert.equal(c.agentTestUpdateStatus, "unknown");
});

// --- isTestable still excludes vanilla To Do tickets --------------------

test("isTestable returns false for a vanilla To Do ticket (no build, no review)", () => {
  // Even though the queue now fetches To Do tickets, they shouldn't appear
  // in the "Ready for you" / "In progress" / "Waiting to start" groups —
  // the new "Not yet picked up" section owns them via status filtering.
  const c = normaliseCandidate(
    makeRawCandidate({
      fields: {
        status: { name: "To Do" },
        customfield_10044: { value: "Candidate" },
        customfield_10046: { value: "" },
        customfield_10047: "",
      },
    }),
  );
  assert.equal(isTestable(c), false);
});

test("isTestable stays true for a Verifying ticket alongside the To Do widening", () => {
  // Sanity: the JQL change shouldn't accidentally have flipped the testable
  // criterion. Keep the existing behaviour locked in.
  const c = normaliseCandidate(makeRawCandidate());
  assert.equal(isTestable(c), true);
});

test("classifyWorkArea routes summaries by [TAG] prefix", () => {
  assert.equal(classifyWorkArea("[AUTH] Token refresh storm", ""), "ios");
  assert.equal(classifyWorkArea("[PUSH] Friend request push always shows Unknown", "Push/Badge"), "ios");
  assert.equal(classifyWorkArea("[BLE] False-positive proximity alert", "Nearby/BLE"), "ios");
  assert.equal(classifyWorkArea("[NOISE] Handshake msg2 fails decryption", "Relay/Noise"), "ios");
  assert.equal(classifyWorkArea("[RELAY] ANNOUNCE broadcast is fully global", ""), "backend");
  assert.equal(classifyWorkArea("[OBS] Give agents authenticated Jira attachment-read access", ""), "backend");
  assert.equal(classifyWorkArea("[WEB] Fix SEO meta tags, GitHub link, and tech page content", ""), "web");
  assert.equal(classifyWorkArea("[LAUNCH] Audit BLE / Local Network purpose strings", ""), "launch");
  assert.equal(classifyWorkArea("[LEGAL] Register HeyBlip word mark in Australia", ""), "launch");
  assert.equal(classifyWorkArea("[OPS] Set up abuse@heyblip.au email aliases", ""), "launch");
});

test("classifyWorkArea falls back to MVP Track when no [TAG] prefix is set", () => {
  // No bracket prefix → consult the Track field.
  assert.equal(classifyWorkArea("Friend request UX polish", "Push/Badge"), "ios");
  assert.equal(classifyWorkArea("Update marketing site copy", "Marketing Site"), "web");
  assert.equal(classifyWorkArea("Sentry alert tuning", "Observability"), "backend");
  // Neither prefix nor a track match → "other" so the chip count is honest.
  assert.equal(classifyWorkArea("Tidy README", ""), "other");
});
