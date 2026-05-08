import type { ChecklistViewModel } from "./mvp-ticket-checklist";

type HumanTestStep = ChecklistViewModel["humanTestPlan"]["steps"][number];

export function findManualBugStep(steps: HumanTestStep[]): HumanTestStep | undefined {
  return (
    steps.find(
      (step) =>
        /run|try|send|check/i.test(step.title) &&
        /phone|device|auth fallback|notification|nearby|message|friend|chat|bug/i.test(`${step.title} ${step.doThis}`) &&
        !/build|commit|agent proof|agent result|pass|fail|jira/i.test(step.title),
    ) || steps.find((step) => step.owner === "John/Tay" && !/agent|build|commit|pass|fail|jira/i.test(step.title))
  );
}

export function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function shortTestInstruction(value: string, workKind: string, applyTrackOverride: boolean = true): string {
  const cleaned = value
    .replace(/^On the named build\/account,\s*/i, "")
    .replace(/^After the real-device\/external check,\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (applyTrackOverride && workKind === "Auth") {
    return "Try the login/offline problem from the ticket. Watch for repeated alerts or retry spam.";
  }

  return capitalizeFirst(cleaned);
}

// Pull the first paragraph (or first ~280 chars) out of a Jira ticket
// description so we can use it as a test guide when the AI didn't post a
// formal plan. Strips heading-like all-caps lines and trims trailing junk.
export function descriptionExcerpt(descriptionText: string): string {
  if (!descriptionText) return "";
  const paragraphs = descriptionText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  // Prefer the first paragraph that reads like prose, not a heading.
  const firstProse = paragraphs.find(
    (p) => p.length > 40 && !/^(Symptom|Root cause|Repro|Expected)\b/i.test(p.split(/[:.]/)[0] || ""),
  );
  const candidate = firstProse || paragraphs[0] || "";
  if (!candidate) return "";
  if (candidate.length <= 280) return candidate;
  // Cut at the first sentence boundary inside the budget.
  const truncated = candidate.slice(0, 280);
  const lastStop = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("? "), truncated.lastIndexOf("! "));
  return (lastStop > 80 ? truncated.slice(0, lastStop + 1) : `${truncated.trim()}…`).trim();
}
