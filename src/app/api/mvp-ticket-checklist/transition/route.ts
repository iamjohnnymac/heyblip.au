import { NextResponse } from "next/server";
import {
  editJiraIssueFields,
  normalizeIssueKey,
  postJiraComment,
  readJiraConfig,
  transitionJiraIssue,
} from "@/lib/mvp-ticket-checklist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Transition ids on the BDEV workflow. Mirrors findings/route.ts.
// The "Mark verified" transition runs a regex validator that requires
// one of: commit hash, build SHA, "skip:", build N, deployed, smoke
// trace passed. Our verification comment always contains "build N" or
// "skip:" so it passes the validator.
const TRANSITION_IDS = {
  "mark-done": "3", // Verifying -> Done ("Mark verified")
  reopen: "4", // Verifying -> In Progress ("Reopen for fix")
} as const;

type TransitionAction = keyof typeof TRANSITION_IDS;

type TransitionPayload = {
  issue?: string;
  issueKey?: string;
  access?: string;
  action?: TransitionAction;
  findingsCommentId?: string;
  aiReasoning?: string;
  buildOrCommit?: string;
};

type TransitionResponse =
  | {
      status: "ready";
      action: TransitionAction;
      verificationCommentId: string;
      // Populated when the status transition succeeded but a follow-up
      // best-effort write (HFR/Loop Stage reset, ATU override comment)
      // failed. The detail page surfaces this so the user knows the
      // queue may not reflect the new state without a manual cleanup.
      partialFailures?: string[];
    }
  | { status: "error"; message: string };

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access?: string): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

export async function POST(request: Request): Promise<NextResponse<TransitionResponse>> {
  let payload: TransitionPayload;
  try {
    payload = (await request.json()) as TransitionPayload;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send a JSON body with the issue key and action." },
      { status: 400 },
    );
  }

  if (!isAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue || payload.issueKey);
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
      { status: 400 },
    );
  }

  const action = payload.action;
  if (action !== "mark-done" && action !== "reopen") {
    return NextResponse.json(
      { status: "error", message: "Action must be 'mark-done' or 'reopen'." },
      { status: 400 },
    );
  }

  const jiraConfig = readJiraConfig();
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured on the server." },
      { status: 503 },
    );
  }

  // Build the comment that goes with the transition. For "mark-done"
  // it MUST contain "build N" or a commit SHA to satisfy the workflow
  // validator. For "reopen" it tells the next coding-agent what to fix.
  const buildOrCommit = (payload.buildOrCommit || "").trim();
  const reasoning = (payload.aiReasoning || "").trim();
  const findingsRef = (payload.findingsCommentId || "").trim();

  const transitionComment = buildTransitionComment({
    action,
    buildOrCommit,
    reasoning,
    findingsCommentId: findingsRef,
  });

  // Post the transition comment first, then run the transition. We
  // post the comment separately (rather than bundled with the
  // transition) so the validator on "Mark verified" reads the
  // freshly-posted comment.
  let verificationCommentId = "";
  try {
    verificationCommentId = await postJiraComment(jiraConfig, issueKey, transitionComment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting the transition comment failed.";
    return NextResponse.json({ status: "error", message }, { status: 502 });
  }

  try {
    await transitionJiraIssue(jiraConfig, issueKey, TRANSITION_IDS[action]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jira transition failed.";
    return NextResponse.json({ status: "error", message }, { status: 502 });
  }

  // On Reopen, the status transition alone leaves the supporting fields
  // (Human Final Review, MVP Loop Stage) stuck at their "Ready"-side
  // values, and the most-recent Agent Test Update still says "passed".
  // Buddy's queue uses those as fallback signals to surface a Ready bucket
  // — without resetting them, the reopened ticket stays in Ready for you.
  // We do the resets best-effort (status flip already succeeded), but
  // collect any failures so the response can flag them — silent prod
  // log-and-forget is what caused the original "still says Ready"
  // regression.
  const partialFailures: string[] = [];
  if (action === "reopen") {
    try {
      await editJiraIssueFields(jiraConfig, issueKey, {
        customfield_10044: { value: "Failed/Reopened" }, // MVP Loop Stage
        customfield_10046: { value: "Failed" }, // Human Final Review
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[transition route] reopen field reset failed for ${issueKey}:`, message);
      partialFailures.push(`Could not reset Loop Stage / Human Final Review: ${message}`);
    }

    // Post a second comment formatted as an Agent Test Update so
    // scanComments picks it up as the *most recent* ATU and flips
    // agentTestUpdateStatus from "passed" to "failed". The
    // most-recent-ATU-wins rule means this overrides the stale
    // "passed" claim from before reopen without rewriting history.
    try {
      const override = buildReopenAtuOverride({
        buildOrCommit,
        reasoning,
        findingsCommentId: findingsRef,
      });
      await postJiraComment(jiraConfig, issueKey, override);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[transition route] reopen ATU-override post failed for ${issueKey}:`, message);
      partialFailures.push(`Could not post the Agent Test Update override comment: ${message}`);
    }
  }

  return NextResponse.json({
    status: "ready",
    action,
    verificationCommentId,
    partialFailures: partialFailures.length ? partialFailures : undefined,
  });
}

// Mirrors the canonical Agent Test Update header / labelled-value layout
// so scanComments + extractAgentTestUpdate both recognise it. The status
// line is forced to "failed" so the most-recent-ATU-wins rule flips
// agentTestUpdateStatus away from "passed".
function buildReopenAtuOverride(input: {
  buildOrCommit: string;
  reasoning: string;
  findingsCommentId: string;
}): string {
  const lines = [
    "Agent Test Update — Reopened by human verification",
    "",
    "Agent testing: failed",
    input.buildOrCommit ? `Build/commit: ${input.buildOrCommit}` : "",
    "Human verification needed: yes",
    "",
    "Reason for reopen:",
    input.reasoning
      ? input.reasoning
      : "Human verification did not pass — see the Human Test Result comment above.",
    "",
    "Status reset by Buddy:",
    "- MVP Loop Stage: Failed/Reopened",
    "- Human Final Review: Failed",
    `- Agent testing classification: failed (overrides any earlier "passed" claim)`,
    "",
    input.findingsCommentId
      ? `Findings comment id: ${input.findingsCommentId}`
      : "See the Human Test Result comment above for the full findings + AI verdict.",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildTransitionComment(input: {
  action: TransitionAction;
  buildOrCommit: string;
  reasoning: string;
  findingsCommentId: string;
}): string {
  const ref = input.findingsCommentId
    ? `See the Human Test Result comment (id ${input.findingsCommentId}) above for the full findings + AI verdict.`
    : "See the Human Test Result comment above for the full findings + AI verdict.";

  if (input.action === "mark-done") {
    // The validator wants a build number or commit SHA in here.
    const buildLine = input.buildOrCommit
      ? `Verified on build ${input.buildOrCommit}.`
      : "Verified on the latest TestFlight build. (skip: build number not surfaced by the AI summary)";
    const lines = [
      "Verification (Mark verified)",
      "",
      buildLine,
      "",
      input.reasoning ? `AI reasoning: ${input.reasoning}` : "",
      "",
      ref,
    ].filter(Boolean);
    return lines.join("\n");
  }

  // Reopen for fix — tell the next coding-agent what's still broken.
  const lines = [
    "Reopen for fix",
    "",
    input.reasoning
      ? `What's still broken (from the AI's read of the human findings):\n${input.reasoning}`
      : "The human findings indicate this isn't done yet — read the Human Test Result comment for what they saw.",
    "",
    input.buildOrCommit ? `Tested on build ${input.buildOrCommit}.` : "",
    "",
    ref,
  ].filter(Boolean);
  return lines.join("\n");
}
