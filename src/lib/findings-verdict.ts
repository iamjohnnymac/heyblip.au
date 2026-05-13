// Builds the AI prompt for "Mark the human test findings" and parses
// the AI's JSON response. Kept in a separate module so node:test can
// exercise the verdict-shaping logic without spinning up Next.js.

export type FindingsVerdict = {
  verdict: "pass" | "fail" | "inconclusive";
  reasoning: string;
  next_step: string;
  evidence_supports_fix: boolean | null;
  concerns: string[];
};

export type FindingsVerdictInput = {
  issueKey: string;
  summary: string;
  acceptanceCriteria: string;
  agentTestUpdate: string;
  buildOrCommit: string;
  findings: string;
  evidence: string;
  surfacePassFail: { label: string; value: "pass" | "fail" | "unknown" }[];
  sentryIds: string[];
};

// System prompt for the verdict call — conservatism is paramount.
// Plain-English output, no jargon, never recommend "pass" on a vague
// "looks fine" report. This text is load-bearing; treat it as content,
// not code, when you change it.
export function buildFindingsSystemPrompt(): string {
  return [
    "You are Buddy, an AI assistant judging whether a HeyBlip bug fix can be closed based on human testing findings.",
    "Your output is a recommendation to a non-technical CEO. Be conservative. When in doubt, prefer 'inconclusive' over 'pass'.",
    "",
    "Pass criteria: the human findings explicitly confirm the acceptance criteria listed in the ticket, AND the evidence (if any) is consistent with the fix working. Either alone is not enough.",
    "Fail criteria: the findings or evidence directly contradict the fix working, OR the human reports a related-but-different bug.",
    "Inconclusive criteria: the human reports something unrelated, or the findings are too vague to map to acceptance criteria, or evidence is missing where it'd normally be expected (e.g. a Sentry-watch ticket with no Sentry IDs in the evidence).",
    "Never recommend 'pass' just because the human said 'looks fine' or 'seems okay' or 'works' — require a specific behavior match against the acceptance criteria.",
    "",
    "Write reasoning in plain English. No jargon. The reader does not code. Say 'the app reconnected once' not 'WS reconnect coalescing observed'.",
    "Keep reasoning to 2-3 sentences. Keep next_step to one line.",
    "",
    "Output JSON only, no prose around it. The JSON must contain:",
    "- verdict: one of 'pass', 'fail', 'inconclusive'",
    "- reasoning: 2-3 sentences in plain English",
    "- next_step: one-line next step",
    "- evidence_supports_fix: true, false, or null",
    "- concerns: array of strings, may be empty",
  ].join("\n");
}

// Builds the JSON-encoded user message for the verdict call. We hand
// the model only the strictly-needed fields and label them so the
// system prompt can refer to them by name in its reasoning.
export function buildFindingsUserPayload(input: FindingsVerdictInput): string {
  return JSON.stringify({
    issue_key: input.issueKey,
    ticket_summary: input.summary,
    acceptance_criteria: input.acceptanceCriteria || "(not extracted from the ticket — judge by the summary and findings)",
    agent_test_update: input.agentTestUpdate || "(no Agent Test Update comment yet)",
    build_or_commit_under_test: input.buildOrCommit || "(not specified)",
    human_findings: input.findings,
    human_evidence: input.evidence || "(none provided)",
    surface_pass_fail_boxes: input.surfacePassFail,
    sentry_ids_in_evidence: input.sentryIds,
  });
}

// Parses the AI's JSON response into a FindingsVerdict. Falls back to
// "inconclusive" with a generic reasoning when the model returns
// malformed output — the UI always has something useful to show.
export function parseFindingsVerdict(rawText: string): FindingsVerdict {
  const trimmed = (rawText || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const slice = first === -1 || last === -1 || last <= first ? trimmed : trimmed.slice(first, last + 1);

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(slice);
  } catch {
    // Try a light repair: quote unquoted keys.
    try {
      parsed = JSON.parse(slice.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":'));
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      verdict: "inconclusive",
      reasoning: "AI couldn't return a clean answer. Re-run, or pick a button manually based on what you saw.",
      next_step: "Try submitting again, or use 'Need more info' to keep the ticket where it is.",
      evidence_supports_fix: null,
      concerns: ["AI response was not valid JSON."],
    };
  }

  const record = parsed as Record<string, unknown>;
  const verdict = normaliseVerdict(record.verdict);
  const reasoning = typeof record.reasoning === "string" && record.reasoning.trim()
    ? record.reasoning.trim()
    : "AI didn't write a reason. Use 'Need more info' and add more detail.";
  const nextStep = typeof record.next_step === "string" && record.next_step.trim()
    ? record.next_step.trim()
    : "Pick the action that matches what you saw on the phone.";
  const evidenceSupportsFix =
    typeof record.evidence_supports_fix === "boolean" ? record.evidence_supports_fix : null;
  const concerns = Array.isArray(record.concerns)
    ? record.concerns.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    verdict,
    reasoning,
    next_step: nextStep,
    evidence_supports_fix: evidenceSupportsFix,
    concerns,
  };
}

function normaliseVerdict(value: unknown): FindingsVerdict["verdict"] {
  if (typeof value !== "string") return "inconclusive";
  const lower = value.toLowerCase().trim();
  if (lower === "pass" || lower === "passed") return "pass";
  if (lower === "fail" || lower === "failed") return "fail";
  return "inconclusive";
}

// Builds the "Human Test Result" Jira comment from the user's findings
// plus the AI's verdict. Plain text — the API route wraps this in ADF
// before posting. Format mirrors the Agent Test Update convention so
// the symmetric parser (extractHumanTestResults) can read it back.
export function buildHumanTestResultComment(input: {
  buildOrCommit: string;
  outcome: FindingsVerdict["verdict"];
  verifier: string;
  findings: string;
  evidence: string;
  aiVerdict: FindingsVerdict;
}): string {
  const lines: string[] = [];
  lines.push("Human Test Result");
  lines.push("");
  lines.push(`Tested on: build ${input.buildOrCommit || "not specified"}`);
  lines.push(`Outcome: ${input.outcome}`);
  lines.push(`Verifier: ${input.verifier || "unknown"}`);
  lines.push("");
  lines.push("Findings:");
  lines.push(input.findings.trim() || "(none provided)");
  lines.push("");
  if (input.evidence.trim()) {
    lines.push("Evidence:");
    lines.push("```");
    lines.push(input.evidence.trim());
    lines.push("```");
    lines.push("");
  } else {
    lines.push("Evidence:");
    lines.push("(none provided)");
    lines.push("");
  }
  lines.push("AI verdict (auto-generated):");
  lines.push(`- Recommendation: ${recommendationLabel(input.aiVerdict.verdict)}`);
  lines.push(`- Reasoning: ${input.aiVerdict.reasoning}`);
  lines.push(`- Next step: ${input.aiVerdict.next_step}`);
  if (input.aiVerdict.concerns.length) {
    lines.push("- Concerns:");
    for (const concern of input.aiVerdict.concerns) {
      lines.push(`  - ${concern}`);
    }
  }
  return lines.join("\n");
}

export function recommendationLabel(verdict: FindingsVerdict["verdict"]): string {
  if (verdict === "pass") return "Mark Done";
  if (verdict === "fail") return "Reopen for fix";
  return "Needs more info";
}

// Deterministic local fallback when no OpenRouter key is configured.
// Plays it safe: every result is "inconclusive" so the human has to
// pick a button explicitly. Lets the dev environment exercise the UI
// without an API key.
export function buildLocalVerdictFallback(input: FindingsVerdictInput): FindingsVerdict {
  const findingsLower = (input.findings || "").toLowerCase();
  const vague = !findingsLower.trim() || /\b(seems? okay|seems? fine|looks? fine|works|all good|i tested it|no issues)\b/.test(findingsLower);
  if (vague) {
    return {
      verdict: "inconclusive",
      reasoning: "Findings are too vague to map to the acceptance criteria. Add specific details about what you saw on the phone (counts, error messages, screens).",
      next_step: "Pick 'Need more info', then write what specifically happened.",
      evidence_supports_fix: null,
      concerns: ["No AI verdict available — OpenRouter is not configured. Be explicit in your findings."],
    };
  }
  return {
    verdict: "inconclusive",
    reasoning: "No AI is connected to score this. Read your findings and pick the button that matches what you actually saw on the phone.",
    next_step: "Pick 'Mark Done' if it worked, 'Reopen for fix' if it didn't, or 'Need more info' if you aren't sure.",
    evidence_supports_fix: null,
    concerns: ["No AI verdict available — OpenRouter is not configured."],
  };
}

// In-memory verdict cache keyed on issueKey + findings hash. Survives
// within a warm Lambda only — that's a deliberate v1 trade-off (matches
// build-status route). Stops a double-click from double-posting +
// double-charging. 30s TTL covers a fast double-tap without sticking.
const VERDICT_CACHE_TTL_MS = 30_000;

type CachedVerdict = {
  expiresAt: number;
  body: unknown;
};

const verdictCache = new Map<string, CachedVerdict>();

export function getCachedVerdict(key: string, now: number): unknown {
  const cached = verdictCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    verdictCache.delete(key);
    return null;
  }
  return cached.body;
}

export function setCachedVerdict(key: string, body: unknown, now: number): void {
  verdictCache.set(key, { expiresAt: now + VERDICT_CACHE_TTL_MS, body });
}

// Stable hash for cache keying. Not cryptographic — just enough to
// dedupe a double-click on the same findings text.
export function hashFindings(findings: string, evidence: string): string {
  const text = `${findings}\n---\n${evidence}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}
