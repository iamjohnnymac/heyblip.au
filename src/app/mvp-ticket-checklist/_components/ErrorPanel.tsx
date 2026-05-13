"use client";

import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  KeyRound,
  LockKeyhole,
} from "lucide-react";
import type { JiraChecklistResult } from "@/lib/mvp-ticket-checklist";

type AccessState = {
  status: "access-required" | "access-misconfigured";
  issueKey: string;
  dashboardUrl: string;
  message: string;
};

type TicketChecklistPageState = JiraChecklistResult | AccessState;

function resultTitle(state: TicketChecklistPageState): string {
  if (state.status === "missing-config") return "Jira setup needed";
  if (state.status === "invalid-issue") return "Use a BDEV ticket key";
  if (state.status === "fetch-error") return "Jira could not load this ticket";
  if (state.status === "access-required") return "Private checklist";
  if (state.status === "access-misconfigured") return "Access key not configured";
  return "Ticket loaded";
}

export function ErrorPanel({
  state,
  accessParam,
}: {
  state: TicketChecklistPageState;
  accessParam: string;
}) {
  const Icon =
    state.status === "access-required" || state.status === "access-misconfigured"
      ? LockKeyhole
      : AlertTriangle;
  const isAccessRequired = state.status === "access-required";
  const message =
    "message" in state ? state.message : "The ticket loaded, but the checklist view is not available.";
  const missingEnv = "missingEnv" in state ? state.missingEnv : [];
  const canUseLocalTokenSetup =
    state.status === "missing-config" &&
    missingEnv.includes("JIRA_API_TOKEN") &&
    !missingEnv.includes("JIRA_BASE_URL") &&
    !missingEnv.includes("JIRA_EMAIL");

  return (
    <div className="min-w-0 rounded-3xl border border-[var(--border-strong)] bg-[var(--card-bg)] p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
          <Icon size={24} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-[var(--muted-strong)]">{state.issueKey || "Checklist"}</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight">{resultTitle(state)}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">{message}</p>
        </div>
      </div>

      {missingEnv.length ? (
        <div className="mt-5 grid gap-2">
          {missingEnv.map((envName) => (
            <code key={envName} className="rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm text-amber-100">
              {envName}
            </code>
          ))}
        </div>
      ) : null}

      {canUseLocalTokenSetup ? (
        <form
          action="/api/mvp-ticket-checklist/jira-token"
          method="post"
          className="mt-5 grid gap-3 rounded-lg border border-sky-300/25 bg-sky-300/10 p-4"
        >
          <input type="hidden" name="issue" value={state.issueKey} />
          <div>
            <p className="text-sm font-bold text-white">Paste your Jira API token once</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-strong)]">
              This stores it in a private localhost cookie for this browser session. It is not shown on the page or put in the URL.
            </p>
          </div>
          <label className="sr-only" htmlFor="jiraApiToken">
            Jira API token
          </label>
          <input
            id="jiraApiToken"
            name="jiraApiToken"
            className="min-h-12 w-full rounded-lg border border-[var(--border)] bg-black/35 px-3 text-base text-white outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            placeholder="Paste Jira API token"
            type="password"
            autoComplete="off"
          />
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] sm:w-fit"
          >
            Save token and load ticket
            <ArrowRight size={17} />
          </button>
        </form>
      ) : null}

      {isAccessRequired ? (
        <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="hidden" name="issue" value={state.issueKey} />
          <label className="sr-only" htmlFor="access">
            Private checklist access key
          </label>
          <div className="relative min-w-0">
            <KeyRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="access"
              name="access"
              defaultValue={accessParam}
              className="min-h-12 w-full rounded-lg border border-[var(--border)] bg-black/30 pl-10 pr-3 text-base text-white outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              placeholder="Access key"
              type="password"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)]"
          >
            Unlock
            <ArrowRight size={17} />
          </button>
        </form>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={state.dashboardUrl}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
        >
          Open Jira dashboard
          <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );
}
