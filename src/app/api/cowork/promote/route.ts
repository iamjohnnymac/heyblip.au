// Cowork v1 — promote a draft.
//
// Removes the `cowork-draft` label and adds `cowork-promoted` so the
// ticket joins the normal BDEV flow. Posts a comment naming John as
// the operator who promoted. Does NOT transition the ticket — that
// stays the operator's call per the BDEV workflow rules.

import { NextResponse } from "next/server";
import {
  postJiraComment,
  readJiraConfig,
  normalizeIssueKey,
} from "@/lib/mvp-ticket-checklist";
import {
  COWORK_LABEL_DRAFT,
  COWORK_LABEL_PROMOTED,
  appendAuditLog,
  isCoworkAccessAllowed,
  newAuditEntry,
} from "@/lib/cowork";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PromotePayload = {
  issue?: string;
  issueKey?: string;
  access?: string;
};

type PromoteResponse =
  | { status: "ready"; issueKey: string }
  | { status: "error"; message: string };

export async function POST(request: Request): Promise<NextResponse<PromoteResponse>> {
  let payload: PromotePayload;
  try {
    payload = (await request.json()) as PromotePayload;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send a JSON body with an issue key." },
      { status: 400 },
    );
  }

  if (!isCoworkAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue || payload.issueKey);
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
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

  // Read current labels so we can swap cowork-draft -> cowork-promoted.
  let currentLabels: string[] = [];
  try {
    const res = await fetch(
      `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=labels`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${jiraConfig.email}:${jiraConfig.token}`,
          ).toString("base64")}`,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Jira returned ${res.status}`);
    }
    const body = (await res.json()) as { fields?: { labels?: string[] } };
    currentLabels = Array.isArray(body.fields?.labels) ? body.fields!.labels! : [];
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to read ticket labels.",
      },
      { status: 502 },
    );
  }

  const nextLabels = Array.from(
    new Set([...currentLabels.filter((l) => l !== COWORK_LABEL_DRAFT), COWORK_LABEL_PROMOTED]),
  );

  // Set labels in one PUT (Jira REST v3 supports labels via fields).
  try {
    const res = await fetch(
      `${jiraConfig.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${jiraConfig.email}:${jiraConfig.token}`,
          ).toString("base64")}`,
        },
        body: JSON.stringify({ fields: { labels: nextLabels } }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Jira returned ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to update labels.",
      },
      { status: 502 },
    );
  }

  try {
    await postJiraComment(
      jiraConfig,
      issueKey,
      "Cowork v1 (BDEV-510) — operator promoted this draft. Removed `cowork-draft`, added `cowork-promoted`. Ticket has joined the normal BDEV flow.",
    );
  } catch {
    // Comment failure is non-fatal — the label swap is the important part.
  }

  await appendAuditLog([
    newAuditEntry({
      decision: "filed",
      mode: "n/a",
      reason: "operator-promoted",
      jiraKey: issueKey,
      details: { labels: nextLabels },
    }),
  ]);

  return NextResponse.json({ status: "ready", issueKey });
}
