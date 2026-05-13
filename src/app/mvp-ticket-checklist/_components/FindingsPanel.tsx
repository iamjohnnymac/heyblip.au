"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Paperclip,
  RefreshCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  TicketCheck,
  X as XIcon,
} from "lucide-react";

export type FindingsVerdict = {
  verdict: "pass" | "fail" | "inconclusive";
  reasoning: string;
  next_step: string;
  evidence_supports_fix: boolean | null;
  concerns: string[];
};

export type FindingsBody =
  | {
      status: "ready";
      verdict: FindingsVerdict;
      postedCommentId: string;
      buildOrCommit: string;
      transitions: {
        markDone: { transitionId: string };
        reopen: { transitionId: string };
      };
      cached: boolean;
      source: "openrouter" | "local-fallback";
    }
  | { status: "error"; message: string };

export type FindingsState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ready"; body: Extract<FindingsBody, { status: "ready" }> }
  | { kind: "error"; message: string };

export type TransitionState =
  | { kind: "idle" }
  | { kind: "submitting"; action: "mark-done" | "reopen" }
  | { kind: "done"; action: "mark-done" | "reopen"; partialFailures?: string[] }
  | { kind: "error"; message: string };

// "Write your findings" panel — the new Step 4 input that turns human
// testing into a Jira comment + AI verdict + 3-action card. Lives below
// the existing pass/fail boxes on Step 4. Renders one of:
//   - the empty form (default)
//   - a loading state (~10s while Claude judges)
//   - the verdict card with 3 buttons (Mark Done / Reopen / Need more info)
//   - an error state with a retry option
// Files the user has selected but not yet uploaded. The dropzone keeps
// these around so they can drop more files in or remove ones before
// submitting. On submit the client uploads the whole set in one POST.
export type PendingAttachment = {
  file: File;
  // Object URL for image previews. Created on add, revoked on remove.
  previewUrl?: string;
};

export function FindingsPanel({
  findingsText,
  setFindingsText,
  evidenceText,
  setEvidenceText,
  attachments,
  onAttachmentsChange,
  state,
  transitionState,
  onSubmit,
  onMarkDone,
  onReopen,
  onNeedMoreInfo,
  onDismissError,
  stickyActions,
}: {
  findingsText: string;
  setFindingsText: (value: string) => void;
  evidenceText: string;
  setEvidenceText: (value: string) => void;
  attachments: PendingAttachment[];
  onAttachmentsChange: (next: PendingAttachment[]) => void;
  state: FindingsState;
  transitionState: TransitionState;
  onSubmit: () => void;
  onMarkDone: () => void;
  onReopen: () => void;
  onNeedMoreInfo: () => void;
  onDismissError: () => void;
  stickyActions?: boolean;
}) {
  const canSubmit = findingsText.trim().length > 0 && state.kind !== "submitting";
  const submitting = state.kind === "submitting";
  const ready = state.kind === "ready";
  const verdict = ready ? state.body.verdict : null;
  const buildOrCommit = ready ? state.body.buildOrCommit : "";

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--accent-light)]">
        <MessageSquareText size={13} />
        Write your findings
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
        Tell Buddy what happened on your phone. Buddy posts it to Jira and asks the AI
        whether this looks done.
      </p>

      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-white">What happened when you tested?</span>
          <textarea
            value={findingsText}
            onChange={(event) => setFindingsText(event.target.value)}
            placeholder="e.g. I backgrounded the app for 2 minutes, brought it back, and only one reconnect line appeared in the log."
            rows={3}
            disabled={submitting}
            className="mt-1.5 block w-full resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
            style={{ minHeight: 72 }}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white">
            Paste any logs, Sentry IDs, or evidence{" "}
            <span className="font-normal text-[var(--muted)]">(optional)</span>
          </span>
          <textarea
            value={evidenceText}
            onChange={(event) => setEvidenceText(event.target.value)}
            placeholder="Paste — Sentry IDs like APPLE-IOS-XX, debug log lines, anything. Drag images or .txt files into the box below."
            rows={5}
            disabled={submitting}
            className="mt-1.5 block w-full resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
            style={{ minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          />
        </label>

        <AttachmentDropzone
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          disabled={submitting}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-bold text-black transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Sending to AI...
            </>
          ) : (
            <>
              <Send size={15} strokeWidth={2.5} />
              Submit findings
            </>
          )}
        </button>
        {!canSubmit && !submitting ? (
          <span className="text-xs text-[var(--muted)]">Write what you saw to enable submit.</span>
        ) : null}
      </div>

      {state.kind === "error" ? (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-300/45 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          <span className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {state.message}
          </span>
          <button
            type="button"
            onClick={onDismissError}
            className="inline-flex items-center gap-1 rounded-md border border-red-300/50 bg-red-300/10 px-2 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/20"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {ready && verdict ? (
        <VerdictCard
          verdict={verdict}
          buildOrCommit={buildOrCommit}
          source={state.body.source}
          transitionState={transitionState}
          onMarkDone={onMarkDone}
          onReopen={onReopen}
          onNeedMoreInfo={onNeedMoreInfo}
          stickyActions={stickyActions}
        />
      ) : null}
    </div>
  );
}

// The AI verdict card — slides in after submit. Shows the AI's call
// (pass / fail / inconclusive), the plain-English reasoning, the
// one-line next step, and the 3 action buttons. All 3 buttons are
// always shown so the human can override the AI.
//
// stickyActions=true (mobile + Step 4): the 3 buttons render at the
// bottom of the viewport instead of inline. The inline slot then shows
// a small placeholder so the card doesn't collapse mid-render.
function VerdictCard({
  verdict,
  buildOrCommit,
  source,
  transitionState,
  onMarkDone,
  onReopen,
  onNeedMoreInfo,
  stickyActions,
}: {
  verdict: FindingsVerdict;
  buildOrCommit: string;
  source: "openrouter" | "local-fallback";
  transitionState: TransitionState;
  onMarkDone: () => void;
  onReopen: () => void;
  onNeedMoreInfo: () => void;
  stickyActions?: boolean;
}) {
  const chip = verdictChipCopy(verdict.verdict);
  const doneAction = transitionState.kind === "done" ? transitionState.action : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`mt-5 rounded-2xl border p-4 sm:p-5 ${chip.cardClass}`}
      role="region"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${chip.chipClass}`}>
          {chip.icon}
          {chip.label}
        </span>
        {source === "local-fallback" ? (
          <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Local fallback
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-base leading-7 text-white">{verdict.reasoning}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
        <span className="font-semibold text-white">Next step:</span> {verdict.next_step}
      </p>

      {verdict.concerns.length > 0 ? (
        <ul className="mt-3 grid list-none gap-1.5 pl-0 text-xs text-[var(--muted-strong)]">
          {verdict.concerns.map((concern, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="mt-1 inline-flex h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" />
              <span>{concern}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {stickyActions ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-[var(--muted)] md:hidden">
          Use the action buttons at the bottom of the screen to mark this done, reopen, or ask for more info.
        </p>
      ) : null}

      <div
        className={`mt-4 grid gap-2 sm:grid-cols-3 ${stickyActions ? "hidden md:grid" : ""}`}
      >
        <VerdictActionButtons
          verdict={verdict}
          transitionState={transitionState}
          onMarkDone={onMarkDone}
          onReopen={onReopen}
          onNeedMoreInfo={onNeedMoreInfo}
        />
      </div>

      {transitionState.kind === "error" ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-300/45 bg-red-300/10 px-3 py-2 text-xs text-red-100">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {transitionState.message}
        </p>
      ) : null}

      {doneAction === "mark-done" ? (
        <div className="mt-4 rounded-xl border border-emerald-300/50 bg-emerald-300/15 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-300/30">
              <TicketCheck size={20} strokeWidth={2.5} className="text-emerald-100" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white">
                Ticket closed in Jira <span aria-hidden>✓</span>
              </p>
              <p className="mt-1 text-sm text-emerald-50/90">
                Verification comment posted{buildOrCommit ? ` against ${buildOrCommit}` : ""}. You&apos;re free to move on.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-emerald-200"
                >
                  <ArrowUp size={13} strokeWidth={2.5} />
                  See Buddy&apos;s next pick
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : doneAction === "reopen" ? (
        <div className="mt-4 rounded-xl border border-amber-300/50 bg-amber-300/15 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300/30">
              <RefreshCcw size={18} strokeWidth={2.5} className="text-amber-100" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white">Sent back to engineering</p>
              <p className="mt-1 text-sm text-amber-50/90">
                The ticket is back in In Progress — the next coding-agent will pick it up.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {transitionState.kind === "done"
        && transitionState.partialFailures
        && transitionState.partialFailures.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-300/45 bg-amber-300/10 px-3 py-3 text-xs text-amber-100">
          <p className="font-semibold">
            Jira moved the ticket, but some follow-up writes didn&apos;t land:
          </p>
          <ul className="mt-1.5 grid list-none gap-1 pl-0">
            {transitionState.partialFailures.map((message, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="mt-1 inline-flex h-1 w-1 shrink-0 rounded-full bg-amber-200" />
                <span>{message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-amber-200/80">
            The queue may still show this ticket in its old bucket — refresh and flag PM if it doesn&apos;t self-correct.
          </p>
        </div>
      ) : null}

      {buildOrCommit ? (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Build judged against: {buildOrCommit}
        </p>
      ) : null}
    </motion.div>
  );
}

// The 3 verdict action buttons — extracted so the same trio can render
// inline on desktop or in the sticky bottom bar on mobile Step 4.
export function VerdictActionButtons({
  verdict,
  transitionState,
  onMarkDone,
  onReopen,
  onNeedMoreInfo,
}: {
  verdict: FindingsVerdict;
  transitionState: TransitionState;
  onMarkDone: () => void;
  onReopen: () => void;
  onNeedMoreInfo: () => void;
}) {
  const isSubmitting = transitionState.kind === "submitting";
  const doneAction = transitionState.kind === "done" ? transitionState.action : null;

  return (
    <>
      <button
        type="button"
        onClick={onMarkDone}
        disabled={isSubmitting || doneAction === "mark-done"}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          verdict.verdict === "pass"
            ? "bg-emerald-300 text-black hover:bg-emerald-200"
            : "border border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
        }`}
      >
        {isSubmitting && transitionState.kind === "submitting" && transitionState.action === "mark-done" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : doneAction === "mark-done" ? (
          <Check size={15} strokeWidth={3} />
        ) : (
          <ThumbsUp size={15} />
        )}
        {doneAction === "mark-done" ? "Marked done" : "Mark Done"}
      </button>
      <button
        type="button"
        onClick={onReopen}
        disabled={isSubmitting || doneAction === "reopen"}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          verdict.verdict === "fail"
            ? "bg-amber-300 text-black hover:bg-amber-200"
            : "border border-amber-300/40 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
        }`}
      >
        {isSubmitting && transitionState.kind === "submitting" && transitionState.action === "reopen" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : doneAction === "reopen" ? (
          <Check size={15} strokeWidth={3} />
        ) : (
          <ThumbsDown size={15} />
        )}
        {doneAction === "reopen" ? "Reopened" : "Reopen for fix"}
      </button>
      <button
        type="button"
        onClick={onNeedMoreInfo}
        disabled={isSubmitting}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <HelpCircle size={15} />
        Need more info
      </button>
    </>
  );
}

// File upload affordance under the evidence textarea. Accepts drag-and-drop
// and click-to-pick for screenshots (png/jpg/heic/gif/webp) and text logs
// (.txt/.log/.json). Shows a chip per file with size and a remove button;
// images get an inline thumbnail. Files only live in client state here —
// upload happens on Submit findings (the parent handles that flow so the
// upload + verdict request can be sequenced).
const ACCEPTED_ATTACHMENT_EXTS = ".png,.jpg,.jpeg,.heic,.heif,.gif,.webp,.txt,.log,.json";
const PER_FILE_MAX_BYTES = 10 * 1024 * 1024;

function AttachmentDropzone({
  attachments,
  onAttachmentsChange,
  disabled,
}: {
  attachments: PendingAttachment[];
  onAttachmentsChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      if (!incoming || disabled) return;
      const list = Array.from(incoming);
      if (list.length === 0) return;
      const rejected: string[] = [];
      const accepted: PendingAttachment[] = [];
      for (const file of list) {
        if (file.size === 0) {
          rejected.push(`${file.name}: empty file.`);
          continue;
        }
        if (file.size > PER_FILE_MAX_BYTES) {
          rejected.push(`${file.name}: over the 10 MB per-file limit.`);
          continue;
        }
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        accepted.push({ file, previewUrl });
      }
      if (accepted.length > 0) {
        onAttachmentsChange([...attachments, ...accepted]);
      }
      setLocalError(rejected.length > 0 ? rejected.join(" ") : null);
    },
    [attachments, disabled, onAttachmentsChange],
  );

  const removeAt = useCallback(
    (index: number) => {
      const next = attachments.filter((_, idx) => idx !== index);
      const removed = attachments[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      onAttachmentsChange(next);
    },
    [attachments, onAttachmentsChange],
  );

  return (
    <div className="block">
      <span className="text-sm font-semibold text-white">
        Screenshots or log files{" "}
        <span className="font-normal text-[var(--muted)]">(optional, max 10 MB each)</span>
      </span>
      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`mt-1.5 cursor-pointer rounded-xl border-2 border-dashed px-4 py-4 text-sm leading-6 transition-colors ${
          disabled
            ? "cursor-not-allowed border-white/10 bg-black/20 text-[var(--muted)] opacity-60"
            : dragging
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white"
              : "border-white/20 bg-black/30 text-[var(--muted-strong)] hover:border-white/35 hover:text-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <Paperclip size={16} className="shrink-0 text-[var(--accent-light)]" />
          <span>
            Drag screenshots or .txt/.log files here, or <span className="font-semibold text-white">click to pick</span>.
            <span className="block text-xs text-[var(--muted)]">
              Files attach to the Jira ticket so the AI sees them when grading.
            </span>
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_ATTACHMENT_EXTS}
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            // Reset so the same file can be re-picked after a remove.
            event.target.value = "";
          }}
        />
      </div>

      {attachments.length > 0 ? (
        <ul className="mt-3 grid list-none gap-2 pl-0">
          {attachments.map((entry, idx) => (
            <li
              key={`${entry.file.name}-${idx}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
            >
              {entry.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.previewUrl}
                  alt={entry.file.name}
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[var(--muted-strong)]">
                  {entry.file.type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{entry.file.name}</p>
                <p className="text-xs text-[var(--muted)]">{formatFileSize(entry.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                aria-label={`Remove ${entry.file.name}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-[var(--muted-strong)] transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {localError ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {localError}
        </p>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function verdictChipCopy(verdict: FindingsVerdict["verdict"]): {
  label: string;
  icon: ReactNode;
  chipClass: string;
  cardClass: string;
} {
  if (verdict === "pass") {
    return {
      label: "AI thinks this is done",
      icon: <ThumbsUp size={13} />,
      chipClass: "bg-emerald-300/20 text-emerald-100",
      cardClass: "border-emerald-300/40 bg-emerald-300/5",
    };
  }
  if (verdict === "fail") {
    return {
      label: "AI thinks this needs more work",
      icon: <ThumbsDown size={13} />,
      chipClass: "bg-amber-300/20 text-amber-100",
      cardClass: "border-amber-300/40 bg-amber-300/5",
    };
  }
  return {
    label: "AI needs more info",
    icon: <HelpCircle size={13} />,
    chipClass: "bg-sky-300/20 text-sky-100",
    cardClass: "border-sky-300/40 bg-sky-300/5",
  };
}
