"use client";

import { Fragment, type ReactNode } from "react";
import { Check, ChevronDown, Copy, ExternalLink, GitBranch } from "lucide-react";
import { decodeHtmlEntities, statusTone, textWrapStyle } from "./shared";

// Renders a plain string with `backtick-wrapped` runs as inline <code>.
// Used wherever Jira-sourced copy reaches the UI as a string (step bodies,
// AI plan paragraphs). Anything not wrapped in backticks renders as-is.
export function InlineMarkdown({ value }: { value: string }) {
  if (!value) return null;
  if (!value.includes("`")) return <>{value}</>;
  const parts = value.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((chunk, idx) => {
        if (!chunk) return null;
        return idx % 2 === 0 ? (
          <Fragment key={idx}>{chunk}</Fragment>
        ) : (
          <code
            key={idx}
            className="box-decoration-clone rounded bg-black/50 px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--accent-light)] [overflow-wrap:anywhere]"
          >
            {chunk}
          </code>
        );
      })}
    </>
  );
}

export function CopyButton({
  status,
  onClick,
  label = "Copy",
}: {
  status?: "copied" | "failed";
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted-strong)] transition-colors hover:text-white"
    >
      {status === "copied" ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
      <span>{status === "copied" ? "Copied" : status === "failed" ? "Try again" : label}</span>
    </button>
  );
}

export function DisclosurePanel({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-[var(--border-strong)] bg-[var(--card-bg)] p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent-light)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-[1.02rem] font-bold text-white">{title}</span>
        {badge ? (
          <span className="hidden text-[0.72rem] text-[var(--muted)] sm:inline">{badge}</span>
        ) : null}
        <ChevronDown
          size={16}
          className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3 border-t border-[var(--border)] pt-3">{children}</div>
    </details>
  );
}

export function IssueLinkRow({
  issueUrl,
  link,
}: {
  issueUrl: string;
  link: { key: string; relationship: string; summary: string; status: string };
}) {
  const baseUrl = issueUrl.split("/browse/")[0] || "https://heyblip.atlassian.net";

  return (
    <a
      href={`${baseUrl}/browse/${encodeURIComponent(link.key)}`}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-black/20 p-4 transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch size={16} className="shrink-0 text-[var(--accent-light)]" />
        <span className="min-w-0 truncate text-sm font-bold">{link.key}</span>
        <span className="rounded-md border border-[var(--border)] bg-black/25 px-2 py-1 text-xs font-semibold text-[var(--muted-strong)]">
          {link.relationship}
        </span>
        <ExternalLink size={14} className="ml-auto shrink-0 text-[var(--muted)]" />
      </div>
      <p className="text-sm leading-6 text-[var(--muted-strong)]" style={textWrapStyle}>
        {decodeHtmlEntities(link.summary) || "No summary returned"}
      </p>
      {link.status ? (
        <span className={`w-fit rounded-md border px-2 py-1 text-xs font-bold ${statusTone(link.status)}`}>
          {link.status}
        </span>
      ) : null}
    </a>
  );
}
