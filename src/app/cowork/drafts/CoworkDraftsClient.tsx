"use client";

// Cowork v1 — operator UI for reviewing draft tickets.
//
// Two stacks:
//   - Drafts: BDEV tickets carrying the `cowork-draft` label. Each card
//     has Promote and Reject buttons that hit /api/cowork/promote and
//     /api/cowork/reject.
//   - Audit: the last N decisions from KV, including shadow-mode
//     "would-file" entries. Useful for the phase 1 sanity check.
//
// Stays intentionally plain — this is operator chrome, not a polished
// product surface.

import { useCallback, useEffect, useState } from "react";

type DraftRow = {
  issueKey: string;
  summary: string;
  status: string;
  created: string;
  labels: string[];
  fingerprint: string | null;
  url: string;
};

type AuditEntry = {
  ts: string;
  decision: string;
  mode: string;
  reason: string;
  sentryShortId?: string;
  sentryUrl?: string;
  fingerprint?: string;
  jiraKey?: string;
  matchedKey?: string;
  tokensUsed?: number;
  details?: Record<string, unknown>;
};

type AuditConfig = {
  enabled: boolean;
  mode: string;
  maxPerHour: number;
  maxPerDay: number;
  maxTokensPerDay: number;
  sentryConfigured: boolean;
  anthropicConfigured: boolean;
};

type AuditCounters = {
  filedThisHour: number;
  filedThisDay: number;
  tokensSpentToday: number;
  kvAvailable: boolean;
};

type Props = {
  accessParam: string;
  gated: boolean;
};

export default function CoworkDraftsClient({ accessParam, gated }: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [auditCounters, setAuditCounters] = useState<AuditCounters | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const accessQuery = accessParam ? `?access=${encodeURIComponent(accessParam)}` : "";

  const loadDrafts = useCallback(async () => {
    if (gated) {
      setDraftsLoading(false);
      return;
    }
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const res = await fetch(`/api/cowork/list${accessQuery}`, { cache: "no-store" });
      const body = await res.json();
      if (body.status === "ready") {
        setDrafts(body.rows || []);
      } else {
        setDraftsError(body.message || "Failed to load drafts.");
      }
    } catch (error) {
      setDraftsError(error instanceof Error ? error.message : "Failed to load drafts.");
    } finally {
      setDraftsLoading(false);
    }
  }, [accessQuery, gated]);

  const loadAudit = useCallback(async () => {
    if (gated) {
      setAuditLoading(false);
      return;
    }
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch(`/api/cowork/audit${accessQuery}`, { cache: "no-store" });
      const body = await res.json();
      if (body.status === "ready") {
        setAudit(body.entries || []);
        setAuditConfig(body.config || null);
        setAuditCounters(body.counters || null);
      } else {
        setAuditError(body.message || "Failed to load audit log.");
      }
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Failed to load audit log.");
    } finally {
      setAuditLoading(false);
    }
  }, [accessQuery, gated]);

  useEffect(() => {
    loadDrafts();
    loadAudit();
  }, [loadDrafts, loadAudit]);

  const handlePromote = async (issueKey: string) => {
    setBusyKey(issueKey);
    setActionMessage(null);
    try {
      const res = await fetch("/api/cowork/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey, access: accessParam }),
      });
      const body = await res.json();
      if (body.status === "ready") {
        setActionMessage(`Promoted ${issueKey}. It has rejoined the normal BDEV flow.`);
        await loadDrafts();
        await loadAudit();
      } else {
        setActionMessage(`Promote failed: ${body.message || "unknown error"}`);
      }
    } catch (error) {
      setActionMessage(`Promote failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleReject = async (issueKey: string) => {
    const reason = window.prompt(`Reject ${issueKey}? Optional reason (for the comment + audit log):`, "");
    if (reason === null) return;
    setBusyKey(issueKey);
    setActionMessage(null);
    try {
      const res = await fetch("/api/cowork/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey, reason, access: accessParam }),
      });
      const body = await res.json();
      if (body.status === "ready") {
        setActionMessage(`Rejected ${issueKey}.`);
        await loadDrafts();
        await loadAudit();
      } else {
        setActionMessage(`Reject failed: ${body.message || "unknown error"}`);
      }
    } catch (error) {
      setActionMessage(`Reject failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRunNow = async () => {
    setActionMessage("Triggering /api/cowork/run …");
    try {
      const res = await fetch(`/api/cowork/run${accessQuery}`, { cache: "no-store" });
      const body = await res.json();
      setActionMessage(
        `Cowork run finished — status=${body.status} mode=${body.mode} filed=${body.filed} wouldFile=${body.wouldFile} deduped=${body.deduped} errors=${body.errors} scanned=${body.scanned}`,
      );
      await loadDrafts();
      await loadAudit();
    } catch (error) {
      setActionMessage(`Run failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };

  if (gated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Cowork drafts</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Access key required. Append <code>?access=&lt;MVP_CHECKLIST_ACCESS_KEY&gt;</code> to the URL.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-semibold">Cowork drafts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            BDEV-510 — Sentry-sourced draft tickets awaiting operator review. Promote sends them into the normal BDEV flow. Reject closes the door so the fingerprint won&apos;t be re-filed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunNow}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Run Cowork now
          </button>
          <button
            onClick={() => {
              loadDrafts();
              loadAudit();
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </header>

      <ConfigSummary config={auditConfig} counters={auditCounters} />

      {actionMessage ? (
        <div className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          {actionMessage}
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Drafts ({drafts.length})</h2>
        {draftsLoading ? (
          <p className="mt-2 text-sm text-zinc-500">Loading drafts…</p>
        ) : draftsError ? (
          <p className="mt-2 text-sm text-red-600">{draftsError}</p>
        ) : drafts.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No drafts in the queue. Cowork is either in shadow mode (look at the audit log below) or has nothing new to file.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {drafts.map((row) => (
              <li
                key={row.issueKey}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {row.issueKey}
                      </a>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {row.status}
                      </span>
                      {row.fingerprint ? (
                        <span className="font-mono text-[10px] text-zinc-500">fp:{row.fingerprint}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">{row.summary}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Created {row.created ? new Date(row.created).toLocaleString() : "—"} ·{" "}
                      {row.labels.join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handlePromote(row.issueKey)}
                      disabled={busyKey === row.issueKey}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Promote
                    </button>
                    <button
                      onClick={() => handleReject(row.issueKey)}
                      disabled={busyKey === row.issueKey}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Audit log (last {audit.length})</h2>
        {auditLoading ? (
          <p className="mt-2 text-sm text-zinc-500">Loading audit log…</p>
        ) : auditError ? (
          <p className="mt-2 text-sm text-red-600">{auditError}</p>
        ) : audit.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No audit entries yet. Once the cron runs (or you press &quot;Run Cowork now&quot;) decisions land here.
          </p>
        ) : (
          <ol className="mt-3 space-y-1 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
            {audit.map((entry, idx) => (
              <li
                key={`${entry.ts}-${idx}`}
                className="border-l-2 border-zinc-200 pl-2 dark:border-zinc-800"
              >
                <span className="text-zinc-500">{entry.ts.replace("T", " ").replace(/\..+$/, "")}</span>{" "}
                <span className="font-semibold uppercase">{entry.decision}</span>{" "}
                <span className="text-zinc-500">[{entry.mode}]</span>{" "}
                {entry.sentryShortId ? <span>sentry:{entry.sentryShortId} </span> : null}
                {entry.fingerprint ? <span>fp:{entry.fingerprint} </span> : null}
                {entry.jiraKey ? <span>jira:{entry.jiraKey} </span> : null}
                {entry.matchedKey ? <span>matched:{entry.matchedKey} </span> : null}
                {entry.tokensUsed ? <span>tok:{entry.tokensUsed} </span> : null}
                <span className="text-zinc-500">reason: {entry.reason}</span>
                {entry.details && Object.keys(entry.details).length > 0 ? (
                  <details className="mt-0.5 ml-2 inline-block">
                    <summary className="cursor-pointer text-zinc-500">details</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all bg-zinc-50 p-2 text-[10px] dark:bg-zinc-900">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function ConfigSummary({
  config,
  counters,
}: {
  config: AuditConfig | null;
  counters: AuditCounters | null;
}) {
  if (!config) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Stat label="Status" value={config.enabled ? "enabled" : "disabled"} highlight={!config.enabled} />
      <Stat label="Mode" value={config.mode} highlight={config.mode === "live"} />
      <Stat
        label="Filed (hr / day)"
        value={`${counters?.filedThisHour ?? "—"} / ${counters?.filedThisDay ?? "—"} (cap ${config.maxPerHour} / ${config.maxPerDay})`}
      />
      <Stat
        label="Tokens today"
        value={`${counters?.tokensSpentToday ?? "—"} / ${config.maxTokensPerDay}`}
      />
      <Stat label="Sentry creds" value={config.sentryConfigured ? "ok" : "missing"} highlight={!config.sentryConfigured} />
      <Stat
        label="Anthropic creds"
        value={config.anthropicConfigured ? "ok" : "fallback only"}
        highlight={!config.anthropicConfigured}
      />
      <Stat label="KV" value={counters?.kvAvailable ? "ok" : "missing"} highlight={!counters?.kvAvailable} />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}
