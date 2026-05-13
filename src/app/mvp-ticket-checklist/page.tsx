import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import {
  getJiraTicketChecklist,
  JIRA_DASHBOARD_URL,
  normalizeIssueKey,
} from "@/lib/mvp-ticket-checklist";
import MvpTicketChecklistClient, { type TicketChecklistPageState } from "./MvpTicketChecklistClient";

const TITLE = "Blip Test Buddy";
const DESCRIPTION =
  "A private helper that turns one HeyBlip Jira ticket into plain-English test steps.";
const LOCAL_JIRA_TOKEN_COOKIE = "mvp_jira_api_token";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/mvp-ticket-checklist" },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/mvp-ticket-checklist",
    type: "article",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SearchParams = Promise<{
  issue?: string | string[];
  access?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function getAccessState(params: Awaited<SearchParams>): TicketChecklistPageState | null {
  if (!needsAccessGate()) return null;

  const issueKey = normalizeIssueKey(params.issue) || "BDEV-493";
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;

  if (!accessKey) {
    return {
      status: "access-misconfigured",
      issueKey,
      dashboardUrl: JIRA_DASHBOARD_URL,
      message:
        "This deployment is locked. Set MVP_CHECKLIST_ACCESS_KEY on the server before rendering private Jira ticket data.",
    };
  }

  if (firstParam(params.access) !== accessKey) {
    return {
      status: "access-required",
      issueKey,
      dashboardUrl: JIRA_DASHBOARD_URL,
      message: "Enter the private checklist access key to load live Jira ticket data.",
    };
  }

  return null;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const cookieStore = await cookies();
  const localJiraApiToken = cookieStore.get(LOCAL_JIRA_TOKEN_COOKIE)?.value;
  const accessParam = firstParam(params.access) || "";
  const gatedState = getAccessState(params);
  const state = gatedState || (await getJiraTicketChecklist(params.issue, { jiraApiToken: localJiraApiToken }));
  const componentKey = state.status === "ready" ? state.data.issueKey : state.issueKey;

  return <MvpTicketChecklistClient key={componentKey} accessParam={accessParam} state={state} />;
}
