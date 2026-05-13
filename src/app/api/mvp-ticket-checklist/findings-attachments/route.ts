import { NextResponse } from "next/server";
import { normalizeIssueKey, readJiraConfig } from "@/lib/mvp-ticket-checklist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Hard cap so a single submit can't blow through Jira attachment limits
// (Jira's default per-attachment cap is 10 MB; we mirror that here and
// also gate total upload size so a single submit doesn't pull down a
// huge log archive accidentally).
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "text/", "application/json"];
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".heic", ".heif", ".gif", ".webp", ".txt", ".log", ".json"]);

type JiraAttachment = {
  id: string;
  filename: string;
  content: string;
  thumbnail?: string;
  mimeType: string;
  size: number;
};

type UploadResponse =
  | { status: "ready"; attachments: JiraAttachment[] }
  | { status: "error"; message: string };

function needsAccessGate(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function isAccessAllowed(access: string | null): boolean {
  if (!needsAccessGate()) return true;
  const accessKey = process.env.MVP_CHECKLIST_ACCESS_KEY;
  return Boolean(accessKey && access === accessKey);
}

function fileAllowed(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `${file.name}: file is over the 10 MB per-file limit.` };
  }
  const mime = file.type || "";
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  const extOk = ALLOWED_EXTENSIONS.has(ext);
  if (!mimeOk && !extOk) {
    return { ok: false, reason: `${file.name}: only screenshots (png/jpg/heic) and text logs (.txt/.log/.json) are accepted.` };
  }
  return { ok: true };
}

export async function POST(request: Request): Promise<NextResponse<UploadResponse>> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { status: "error", message: "Send the upload as multipart/form-data with one or more file fields." },
      { status: 400 },
    );
  }

  const access = (form.get("access") as string | null) ?? null;
  if (!isAccessAllowed(access)) {
    return NextResponse.json({ status: "error", message: "Access key required." }, { status: 401 });
  }

  const issueKey = normalizeIssueKey((form.get("issue") as string | null) ?? (form.get("issueKey") as string | null) ?? "");
  if (!issueKey) {
    return NextResponse.json(
      { status: "error", message: "Use a Jira issue key like BDEV-494." },
      { status: 400 },
    );
  }

  const config = readJiraConfig();
  if ("missingEnv" in config) {
    return NextResponse.json(
      {
        status: "error",
        message: `Jira credentials missing on the server (${config.missingEnv.join(", ")}). Set them in Vercel env vars.`,
      },
      { status: 500 },
    );
  }

  // Accept files under either `file` or `files` keys (the dropzone in
  // FindingsPanel sends each File under "file"; the named-attachment test
  // uses "files" — supporting both keeps the route forgiving).
  const fileEntries = [...form.getAll("file"), ...form.getAll("files")].filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );

  if (fileEntries.length === 0) {
    return NextResponse.json(
      { status: "error", message: "Attach at least one file to upload." },
      { status: 400 },
    );
  }

  let totalBytes = 0;
  for (const file of fileEntries) {
    const check = fileAllowed(file);
    if (!check.ok) {
      return NextResponse.json({ status: "error", message: check.reason }, { status: 400 });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { status: "error", message: `Total upload is over the 30 MB limit (got ${(totalBytes / 1024 / 1024).toFixed(1)} MB).` },
      { status: 400 },
    );
  }

  // Jira's attachments endpoint accepts multiple files in a single
  // multipart POST. Build a fresh FormData on the server so we control
  // the field name (must be `file`) and don't leak the access key etc.
  const upstream = new FormData();
  for (const file of fileEntries) {
    upstream.append("file", file, file.name);
  }

  const url = `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      // Atlassian requires this header on every attachment request to
      // confirm the caller acknowledges XSRF protection bypass.
      "X-Atlassian-Token": "no-check",
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`,
      Accept: "application/json",
    },
    body: upstream,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json(
      {
        status: "error",
        message: `Jira rejected the upload (${response.status}). ${text.slice(0, 200) || "Check that the issue key is right and the account can attach files."}`,
      },
      { status: response.status === 401 || response.status === 403 ? response.status : 502 },
    );
  }

  const raw = (await response.json()) as Array<Record<string, unknown>>;
  const attachments: JiraAttachment[] = Array.isArray(raw)
    ? raw.map((entry) => ({
        id: String(entry.id ?? ""),
        filename: String(entry.filename ?? "attachment"),
        content: String(entry.content ?? ""),
        thumbnail: entry.thumbnail ? String(entry.thumbnail) : undefined,
        mimeType: String(entry.mimeType ?? ""),
        size: Number(entry.size ?? 0),
      }))
    : [];

  return NextResponse.json({ status: "ready", attachments });
}
