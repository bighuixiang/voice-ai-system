export type RunFailureKind = "transient-infrastructure" | "input-missing" | "quality-guard" | "author-gate" | "budget" | "permission" | "unrecoverable-data";
export interface FailureIsolationDecision { schemaVersion: "failure-isolation-decision.v1"; action: "retry-with-backoff" | "isolate-and-stop" | "degrade-with-evidence" | "await-author" | "hard-stop"; blockDependents: boolean; continueUnrelated: boolean; }

export function classifyRunFailure(code: string): RunFailureKind {
  if (/timeout|network|rate[-_ ]?limit|5\d\d/iu.test(code)) return "transient-infrastructure";
  if (/missing|input|schema/iu.test(code)) return "input-missing";
  if (/quality|guard|review/iu.test(code)) return "quality-guard";
  if (/author|approval/iu.test(code)) return "author-gate";
  if (/budget|cost/iu.test(code)) return "budget";
  if (/permission|auth/iu.test(code)) return "permission";
  return "unrecoverable-data";
}

export function decideFailureIsolation(input: { kind: RunFailureKind; critical: boolean }): FailureIsolationDecision {
  const action = input.kind === "transient-infrastructure" ? "retry-with-backoff" : input.kind === "quality-guard" && !input.critical ? "degrade-with-evidence" : input.kind === "author-gate" ? "await-author" : input.kind === "budget" || input.kind === "permission" ? "hard-stop" : "isolate-and-stop";
  return { schemaVersion: "failure-isolation-decision.v1", action, blockDependents: input.critical || input.kind === "unrecoverable-data", continueUnrelated: input.kind !== "budget" && input.kind !== "permission" };
}
