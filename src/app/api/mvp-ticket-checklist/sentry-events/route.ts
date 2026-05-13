import { NextResponse } from "next/server";
import { fetchSentryIssueSnapshots, MAX_SENTRY_IDS_PER_CALL, type SentryFetchResult } from "@/lib/sentry-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Compact Sentry snapshot endpoint for Buddy's detail page. Takes a
// comma-separated list of Sentry short-ids (?ids=APPLE-IOS-1Z,...) and
// returns live counts + last-seen + status per id. The Findings route
// uses the same shared helper to fold this into Sonnet's evidence.

type Response = SentryFetchResult | { status: "error"; message: string };

function isAccessAllowed(access: string | null): boolean {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

export async function GET(request: Request): Promise<NextResponse<Response>> {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");
  if (!isAccessAllowed(access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_SENTRY_IDS_PER_CALL);

  if (ids.length === 0) {
    return NextResponse.json(
      { status: "error", message: "Pass at least one Sentry short-id via ?ids=APPLE-IOS-1Z" },
      { status: 400 },
    );
  }

  const result = await fetchSentryIssueSnapshots(ids);
  return NextResponse.json(result);
}
