// Buddy queue overview — bird's-eye view of every BDEV ticket in testing.
//
// Mirrors the split pattern used by /mvp-ticket-checklist: this file is a
// server component that owns metadata + the access gate, then renders the
// client component (QueueClient) that handles fetching, filtering, and
// 30s polling.

import type { Metadata } from "next";
import { connection } from "next/server";
import QueueClient from "./QueueClient";

const TITLE = "Buddy queue";
const DESCRIPTION =
  "Private overview of every BDEV ticket in testing — what's ready for John, what AI is working on, and what's still waiting.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/queue" },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/queue",
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
  access?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  // Force dynamic rendering — the queue is live data and must never be
  // cached statically.
  await connection();

  const params = await searchParams;
  const accessParam = firstParam(params.access) || "";

  if (needsAccessGate()) {
    const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
    if (!accessKey) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-16 sm:px-8 sm:py-24">
          <h1 className="text-2xl font-extrabold tracking-tight">Buddy queue is locked</h1>
          <p className="text-sm leading-6 text-[var(--muted-strong)]">
            Set <code className="rounded bg-black/40 px-1 text-[0.85em]">MVP_CHECKLIST_ACCESS_KEY</code>{" "}
            on the server before this page can render private Jira data.
          </p>
        </main>
      );
    }
    if (accessParam !== accessKey) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-16 sm:px-8 sm:py-24">
          <h1 className="text-2xl font-extrabold tracking-tight">Access key required</h1>
          <p className="text-sm leading-6 text-[var(--muted-strong)]">
            Add <code className="rounded bg-black/40 px-1 text-[0.85em]">?access=…</code> to the URL
            to load the live Buddy queue.
          </p>
        </main>
      );
    }
  }

  return <QueueClient accessParam={accessParam} />;
}
