import type { Metadata } from "next";
import { connection } from "next/server";
import CoworkDraftsClient from "./CoworkDraftsClient";

const TITLE = "Cowork drafts";
const DESCRIPTION =
  "Operator-facing list of BDEV tickets Cowork v1 has drafted from Sentry signal. Promote to join the normal flow, or reject with a reason.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/cowork/drafts" },
  robots: { index: false, follow: false },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/cowork/drafts", type: "article" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SearchParams = Promise<{
  access?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const accessParam = firstParam(params.access) || "";

  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  const gated = needsAccessGate() && (!accessKey || accessParam !== accessKey);

  return <CoworkDraftsClient accessParam={accessParam} gated={gated} />;
}
