// Cowork v1 — audit log readout. Returns the last N decisions from
// KV so the operator can review what Cowork did (or would have done in
// shadow mode) without paging through Vercel function logs.

import { NextResponse } from "next/server";
import {
  formatAuditEntryAsText,
  isCoworkAccessAllowed,
  readAuditLog,
  readCounters,
  readCoworkConfig,
  type AuditEntry,
} from "@/lib/cowork";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type AuditResponse = {
  status: "ready" | "error";
  entries: AuditEntry[];
  formatted: string[];
  counters: { filedThisHour: number; filedThisDay: number; tokensSpentToday: number; kvAvailable: boolean };
  config: {
    enabled: boolean;
    mode: string;
    maxPerHour: number;
    maxPerDay: number;
    maxTokensPerDay: number;
    sentryConfigured: boolean;
    anthropicConfigured: boolean;
  };
  message?: string;
};

export async function GET(request: Request): Promise<NextResponse<AuditResponse>> {
  const url = new URL(request.url);
  const access = url.searchParams.get("access");
  if (!isCoworkAccessAllowed(access)) {
    return NextResponse.json(
      {
        status: "error",
        entries: [],
        formatted: [],
        counters: { filedThisHour: 0, filedThisDay: 0, tokensSpentToday: 0, kvAvailable: false },
        config: {
          enabled: false,
          mode: "shadow",
          maxPerHour: 0,
          maxPerDay: 0,
          maxTokensPerDay: 0,
          sentryConfigured: false,
          anthropicConfigured: false,
        },
        message: "Access key required.",
      },
      { status: 401 },
    );
  }

  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const config = readCoworkConfig();
  const counters = await readCounters();
  const entries = await readAuditLog(limit);

  return NextResponse.json({
    status: "ready",
    entries,
    formatted: entries.map(formatAuditEntryAsText),
    counters,
    config: {
      enabled: config.enabled,
      mode: config.mode,
      maxPerHour: config.maxPerHour,
      maxPerDay: config.maxPerDay,
      maxTokensPerDay: config.maxTokensPerDay,
      sentryConfigured: Boolean(config.sentryAuthToken),
      anthropicConfigured: Boolean(config.anthropicApiKey),
    },
  });
}
