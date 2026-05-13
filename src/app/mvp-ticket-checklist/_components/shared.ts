import type { CSSProperties } from "react";

export const textWrapStyle: CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

// Plain-English relative time. "just now", "2 hours ago", "yesterday",
// "3 days ago". Falls back to a date string for older timestamps.
export function plainRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// Reduces the verbose "Build/commit: PR ... head commit `97e6ddc` ..." line
// the AI writes to a single short token suitable for a chip — "build 65" or
// "commit e027d3e". Falls back to the raw value (truncated) when nothing
// concrete jumps out.
// User-facing "what to install" line. Extracts just the build number so
// the Step 2 body reads "Look for build 65" instead of "Look for build
// build 65 / 5a1c2e1a83e9463550652b10f1035f8334a17c92". When no build
// number is parseable, falls back to "the latest TestFlight build" so the
// instruction still makes sense without dumping a raw SHA at the reader.
export function buildInstallLabel(raw: string): string {
  if (!raw) return "the latest TestFlight build";
  const buildMatch = raw.match(/\bbuild\s+(\d+[a-z]?)\b/i);
  if (buildMatch) return `build ${buildMatch[1]}`;
  return "the latest TestFlight build";
}

// Short proof token — just the SHA short form. Returns "" when no commit
// is parseable. Used as secondary muted text next to the install label.
export function buildProofSha(raw: string): string {
  if (!raw) return "";
  const shaMatch = raw.match(/(?:\s|`|^|@|\/)([0-9a-f]{7,40})(?:\s|`|$)/i);
  if (shaMatch && !/^BDEV-/i.test(shaMatch[1])) {
    return shaMatch[1].slice(0, 7);
  }
  return "";
}

export function shortBuildOrCommitChip(raw: string): { label: string; full: string } | null {
  if (!raw) return null;
  const buildMatch = raw.match(/\bbuild\s+(\d+[a-z]?)\b/i);
  if (buildMatch) {
    return { label: `Fix is in: build ${buildMatch[1]}`, full: raw };
  }
  // 7-12 char hex chunk surrounded by backticks or whitespace = a commit SHA
  // worth showing. Skip BDEV/HEY ticket keys so we don't display BDEV-493 here.
  const shaMatch = raw.match(/(?:\s|`|^)([0-9a-f]{7,12})(?:\s|`|$)/i);
  if (shaMatch && !/^BDEV-/i.test(shaMatch[1])) {
    return { label: `Fix is in: commit ${shaMatch[1]}`, full: raw };
  }
  // Last-resort: just show "Build/commit on file" — better than nothing for
  // edge cases like "PR https://github.com/.../pull/391".
  if (/pr\s*[#]?\d+|pull\/\d+/i.test(raw)) {
    const prMatch = raw.match(/pull\/(\d+)|PR\s*#?(\d+)/i);
    const prNum = prMatch ? prMatch[1] || prMatch[2] : "";
    return { label: prNum ? `Fix is in: PR #${prNum}` : "Build/commit named", full: raw };
  }
  return null;
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for browsers that deny clipboard permission.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function truncate(value: string, max: number): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

// Jira REST sometimes returns summaries with HTML-encoded characters
// ("Auth &amp; Identity"). Decode the handful of entities Atlassian emits
// so they render as their actual glyphs.
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

// Detect bare or parenthesised ISO timestamps inside a free-form Jira value
// ("build 60 (2026-05-07T06:27:30Z)") and rewrite them as a friendly local
// date so the UI doesn't bleed raw machine timestamps. Non-date values pass
// through unchanged.
const ISO_TS_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;

export function humaniseTimestamps(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(ISO_TS_RE, (iso) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return iso;
    try {
      return new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  });
}

export function statusTone(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("passed")) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (lower.includes("progress") || lower.includes("review") || lower.includes("build")) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  }
  if (lower.includes("fail") || lower.includes("block")) return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)]";
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function openCodex(): void {
  if (isMobileDevice()) {
    window.open("https://chatgpt.com/codex", "_blank", "noopener,noreferrer");
  } else {
    window.location.href = "codex://";
  }
}

export function openClaude(): void {
  if (isMobileDevice()) {
    window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
  } else {
    window.location.href = "claude://";
  }
}
