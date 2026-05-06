import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeIssueKey } from "@/lib/mvp-ticket-checklist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const LOCAL_JIRA_TOKEN_COOKIE = "mvp_jira_api_token";

function isLocalDev(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

export async function POST(request: Request) {
  if (!isLocalDev()) {
    return NextResponse.json({ status: "error", message: "Local Jira token setup is disabled outside local development." }, { status: 403 });
  }

  const formData = await request.formData();
  const issue = normalizeIssueKey(String(formData.get("issue") || "")) || "BDEV-493";
  const token = String(formData.get("jiraApiToken") || "").trim();

  if (!token) {
    return NextResponse.redirect(new URL(`/mvp-ticket-checklist?issue=${encodeURIComponent(issue)}&setup=missing-token`, request.url));
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCAL_JIRA_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.redirect(new URL(`/mvp-ticket-checklist?issue=${encodeURIComponent(issue)}&setup=token-saved`, request.url));
}
