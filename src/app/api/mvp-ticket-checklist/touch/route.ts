import { NextResponse } from "next/server";
import { recordPresence } from "@/lib/buddy-presence";
import { normalizeIssueKey } from "@/lib/mvp-ticket-checklist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type TouchPayload = {
  issue?: string;
  sessionId?: string;
  access?: string;
};

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access?: string): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

export async function POST(request: Request) {
  let payload: TouchPayload;
  try {
    payload = (await request.json()) as TouchPayload;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  if (!isAccessAllowed(payload.access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey(payload.issue);
  if (!issueKey) {
    return NextResponse.json({ status: "error", message: "Invalid issue key" }, { status: 400 });
  }

  const sessionId = (payload.sessionId || "").trim().slice(0, 64);
  if (!sessionId) {
    return NextResponse.json({ status: "error", message: "Missing sessionId" }, { status: 400 });
  }

  await recordPresence(issueKey, sessionId);
  return NextResponse.json({ status: "ok" });
}
