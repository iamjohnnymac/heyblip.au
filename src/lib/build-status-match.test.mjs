import test from "node:test";
import assert from "node:assert/strict";

import { pickBestRun } from "./build-status-match.ts";

const NOW = Date.parse("2026-05-07T07:00:00Z");

function makeRun({
  id,
  branch = "main",
  message = "chore: routine maintenance",
  status = "completed",
  conclusion = "success",
  createdAt,
  updatedAt,
  sha = "deadbeef",
  name = "Deploy to TestFlight",
} = {}) {
  return {
    id,
    name,
    status,
    conclusion,
    html_url: `https://github.com/iamjohnnymac/heyblip/actions/runs/${id}`,
    head_sha: sha,
    head_branch: branch,
    created_at: createdAt,
    updated_at: updatedAt ?? createdAt,
    head_commit: { message },
  };
}

test("pickBestRun picks the run whose commit message references the ticket on main", () => {
  const runs = [
    // Older main run, no ticket reference.
    makeRun({
      id: 1,
      branch: "main",
      message: "chore: bump deps",
      createdAt: "2026-05-05T00:00:00Z",
    }),
    // Older main run, references the ticket.
    makeRun({
      id: 2,
      branch: "main",
      message: "fix(auth): wire account-not-found recovery (BDEV-493) (#391)",
      createdAt: "2026-05-04T00:00:00Z",
    }),
    // Newest main run, references a different ticket.
    makeRun({
      id: 3,
      branch: "main",
      message: "fix(chat): something else (BDEV-500)",
      createdAt: "2026-05-06T00:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.match, "ticket");
  assert.equal(result.run?.id, 2);
});

test("pickBestRun returns the newest match when multiple commits reference the ticket", () => {
  const runs = [
    makeRun({
      id: 10,
      branch: "main",
      message: "fix(auth): first take (BDEV-493)",
      createdAt: "2026-05-04T00:00:00Z",
    }),
    makeRun({
      id: 11,
      branch: "main",
      message: "fix(auth): retry the BDEV-493 fix (BDEV-493) (#391)",
      createdAt: "2026-05-06T00:00:00Z",
    }),
    makeRun({
      id: 12,
      branch: "main",
      message: "fix(auth): one more pass (BDEV-493)",
      createdAt: "2026-05-05T00:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.match, "ticket");
  assert.equal(result.run?.id, 11);
});

test("pickBestRun prefers a main run over a preview-branch run for the same ticket", () => {
  const runs = [
    makeRun({
      id: 20,
      branch: "fix/BDEV-493-auth-recovery",
      message: "wip",
      createdAt: "2026-05-06T08:00:00Z",
    }),
    makeRun({
      id: 21,
      branch: "main",
      message: "fix(auth): land (BDEV-493) (#391)",
      createdAt: "2026-05-06T07:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.match, "ticket");
  assert.equal(result.run?.id, 21);
});

test("pickBestRun falls back to preview-branch when no main commit references the ticket", () => {
  const runs = [
    makeRun({
      id: 30,
      branch: "main",
      message: "chore: docs",
      createdAt: "2026-05-06T08:00:00Z",
    }),
    makeRun({
      id: 31,
      branch: "fix/BDEV-493-recovery",
      message: "wip",
      status: "in_progress",
      conclusion: null,
      createdAt: "2026-05-06T07:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.match, "preview-branch");
  assert.equal(result.run?.id, 31);
});

test("pickBestRun falls back to latest-main when nothing references the ticket", () => {
  const runs = [
    makeRun({
      id: 40,
      branch: "main",
      message: "chore: older",
      createdAt: "2026-05-04T00:00:00Z",
    }),
    makeRun({
      id: 41,
      branch: "main",
      message: "feat: newest, unrelated",
      createdAt: "2026-05-06T00:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-999", NOW);
  assert.equal(result.match, "latest-main");
  assert.equal(result.run?.id, 41);
});

test("pickBestRun returns none for an empty list", () => {
  const result = pickBestRun([], "BDEV-493", NOW);
  assert.equal(result.match, "none");
  assert.equal(result.run, null);
});

test("pickBestRun returns none when there are only non-main runs that don't include the issue key", () => {
  const runs = [
    makeRun({
      id: 50,
      branch: "fix/BDEV-100-other",
      message: "wip",
      createdAt: "2026-05-06T00:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.match, "none");
  assert.equal(result.run, null);
});

test("pickBestRun computes durationSec correctly for completed runs (updated - created)", () => {
  const runs = [
    makeRun({
      id: 60,
      branch: "main",
      message: "fix(auth): land (BDEV-493)",
      createdAt: "2026-05-07T06:27:34Z",
      updatedAt: "2026-05-07T06:37:23Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  // 06:37:23 - 06:27:34 = 9m 49s = 589s
  assert.equal(result.run?.durationSec, 589);
});

test("pickBestRun computes durationSec from now for in_progress runs", () => {
  const runs = [
    makeRun({
      id: 70,
      branch: "main",
      message: "fix(auth): land (BDEV-493)",
      status: "in_progress",
      conclusion: null,
      createdAt: "2026-05-07T06:57:00Z",
      updatedAt: "2026-05-07T06:57:00Z",
    }),
  ];

  // NOW is 07:00:00Z, run started at 06:57:00Z -> 180s
  const result = pickBestRun(runs, "BDEV-493", NOW);
  assert.equal(result.run?.durationSec, 180);
});

test("pickBestRun does not match a bare 'BDEV-493' substring without parens", () => {
  // Hardening: a stray reference in prose shouldn't count as a ticket match.
  const runs = [
    makeRun({
      id: 80,
      branch: "main",
      message: "chore: mention BDEV-493 in the body but not as the formal tag",
      createdAt: "2026-05-06T00:00:00Z",
    }),
  ];

  const result = pickBestRun(runs, "BDEV-493", NOW);
  // Falls back to latest-main since the parens form is missing.
  assert.equal(result.match, "latest-main");
  assert.equal(result.run?.id, 80);
});
