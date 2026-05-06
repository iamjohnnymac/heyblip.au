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
