// Cowork v1 — list draft tickets for the /cowork/drafts UI.
//
// JQL: any BDEV ticket with the `cowork-draft` label, sorted newest
// first. This is what the dashboard renders so John can promote or
// reject each draft.

import { NextResponse } from "next/server";
import { jiraFetch, readJiraConfig } from "@/lib/mvp-ticket-checklist";
import { COWORK_LABEL_DRAFT, isCoworkAccessAllowed } from "@/lib/cowork";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type DraftRow = {
  issueKey: string;
  summary: string;
  status: string;
  created: string;
  labels: string[];
  fingerprint: string | null;
  url: string;
};

type ListResponse =
  | { status: "ready"; rows: DraftRow[]; total: number }
  | { status: "error"; message: string; missingEnv?: string[] };

export async function GET(request: Request): Promise<NextResponse<ListResponse>> {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");
  if (!isCoworkAccessAllowed(access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const jiraConfig = readJiraConfig();
  if ("missingEnv" in jiraConfig) {
    return NextResponse.json(
      { status: "error", message: "Jira is not configured.", missingEnv: jiraConfig.missingEnv },
      { status: 503 },
    );
  }

  const jql = `project = BDEV AND labels = "${COWORK_LABEL_DRAFT}" ORDER BY created DESC`;
  const path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,labels,created&maxResults=50`;

  type RawIssue = {
    key?: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
      labels?: string[];
      created?: string;
    };
  };

  let raw: { issues?: RawIssue[] };
  try {
    raw = await jiraFetch<{ issues?: RawIssue[] }>(jiraConfig, path);
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Jira search failed." },
      { status: 502 },
    );
  }

  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const baseUrl = jiraConfig.baseUrl.replace(/\/$/, "");
  const rows: DraftRow[] = issues
    .filter((i): i is RawIssue & { key: string } => typeof i.key === "string")
    .map((i) => {
      const labels = Array.isArray(i.fields?.labels) ? i.fields!.labels! : [];
      const fingerprintLabel = labels.find((l) => l.startsWith("cowork-fingerprint-"));
      return {
        issueKey: i.key,
        summary: i.fields?.summary || i.key,
        status: i.fields?.status?.name || "Unknown",
        created: i.fields?.created || "",
        labels,
        fingerprint: fingerprintLabel ? fingerprintLabel.slice("cowork-fingerprint-".length) : null,
        url: `${baseUrl}/browse/${i.key}`,
      };
    });

  return NextResponse.json({ status: "ready", rows, total: rows.length });
}
