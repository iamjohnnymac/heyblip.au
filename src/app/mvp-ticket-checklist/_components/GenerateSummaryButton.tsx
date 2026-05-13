"use client";

// "Generate AI Summary" button — surfaces in the FocusCard step 1 body
// (and the Send-to-AI area) when the ticket has no Agent Test Update
// comment yet AND the ticket is in a status where AI work is meaningful
// (Verifying / In Progress). To Do tickets keep the existing Send to
// Codex/Claude flow.
//
// Click → POSTs to /api/mvp-ticket-checklist/generate-summary, waits
// (~10s) for Sonnet to write the comment, the route posts it to Jira,
// and we router.refresh() so the AgentTestSummaryPanel renders inline
// without a page reload.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";

export type GenerateSummaryButtonProps = {
  issueKey: string;
  accessParam: string;
};

type GenerateState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function GenerateSummaryButton({ issueKey, accessParam }: GenerateSummaryButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<GenerateState>({ kind: "idle" });

  async function handleGenerate() {
    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/mvp-ticket-checklist/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: issueKey, access: accessParam }),
      });
      const body = (await response.json()) as
        | { status: "ready"; commentId: string }
        | { status: "exists"; message: string }
        | { status: "error"; message: string };

      if (response.status === 409 && body.status === "exists") {
        // Someone (or another tab) just posted one — treat as a success
        // and let router.refresh pull the new state.
        setState({ kind: "done" });
        router.refresh();
        window.setTimeout(() => setState({ kind: "idle" }), 5000);
        return;
      }

      if (!response.ok || body.status !== "ready") {
        const message =
          "message" in body && body.message
            ? body.message
            : "Buddy couldn't generate this. Try again.";
        setState({ kind: "error", message });
        return;
      }

      setState({ kind: "done" });
      router.refresh();
      window.setTimeout(() => setState({ kind: "idle" }), 5000);
    } catch {
      setState({ kind: "error", message: "Buddy couldn't reach the server. Try again." });
    }
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--accent-light)]">
        <Sparkles size={13} />
        No AI summary in Jira yet
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
        Ask the AI to write a test summary for this ticket. It posts straight to Jira so
        you can read it inline here — usually takes about 10 seconds.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (state.kind === "submitting" || state.kind === "done") return;
            void handleGenerate();
          }}
          disabled={state.kind === "submitting" || state.kind === "done"}
          aria-busy={state.kind === "submitting"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "submitting" ? (
            <>
              <Loader2 size={15} className="animate-spin" strokeWidth={2.5} />
              Asking the AI to write a summary...
            </>
          ) : state.kind === "done" ? (
            <>
              <CheckCircle2 size={15} strokeWidth={2.5} />
              Summary posted to Jira
            </>
          ) : (
            <>
              <Sparkles size={15} strokeWidth={2.5} />
              Generate AI Summary
            </>
          )}
        </button>
        {state.kind === "submitting" ? (
          <span className="text-xs text-[var(--muted)]">
            Hang tight — this can take up to 30 seconds.
          </span>
        ) : null}
      </div>

      {state.kind === "done" ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300/45 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100"
        >
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>
            AI summary posted to Jira. Pulling it in — the summary will render here in a
            moment.
          </span>
        </motion.div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-300/45 bg-red-300/10 px-3 py-2 text-sm text-red-100"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {state.message}
          </span>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-1 rounded-md border border-red-300/50 bg-red-300/10 px-2 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/20"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
