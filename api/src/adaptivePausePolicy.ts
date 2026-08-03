import crypto from "node:crypto";

export type AdaptivePauseStatus = "hard_pause" | "soft_recap" | "continue";

export interface AdaptivePauseDecision {
  schemaVersion: "adaptive-pause-decision.v1";
  pausePolicyVersion: "adaptive-risk-pause.v1";
  status: AdaptivePauseStatus;
  nextAction: "pause_and_discuss" | "emit_milestone_recap" | "continue_within_grant";
  hardReasons: string[];
  softTriggers: string[];
  continuationRequiresExistingGrant: true;
  settledChapterCount: number;
  evaluatedAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertAdaptivePauseDecision(value: unknown): AdaptivePauseDecision {
  if (!value || typeof value !== "object") throw new Error("ADAPTIVE_PAUSE_DECISION_INTEGRITY_FAILED");
  const decision = value as Partial<AdaptivePauseDecision>;
  const validStatuses = new Set<AdaptivePauseStatus>(["hard_pause", "soft_recap", "continue"]);
  const validActions = new Set(["pause_and_discuss", "emit_milestone_recap", "continue_within_grant"]);
  const actionForStatus = {
    hard_pause: "pause_and_discuss",
    soft_recap: "emit_milestone_recap",
    continue: "continue_within_grant"
  } as const;
  const arraysValid = [decision.hardReasons, decision.softTriggers].every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"));
  const fingerprintValid = typeof decision.fingerprint === "string" && /^[a-f0-9]{64}$/.test(decision.fingerprint);
  const base = { ...decision } as Record<string, unknown>;
  delete base.fingerprint;
  if (
    decision.schemaVersion !== "adaptive-pause-decision.v1" ||
    decision.pausePolicyVersion !== "adaptive-risk-pause.v1" ||
    !validStatuses.has(decision.status as AdaptivePauseStatus) ||
    !validActions.has(decision.nextAction as string) ||
    actionForStatus[decision.status as AdaptivePauseStatus] !== decision.nextAction ||
    decision.continuationRequiresExistingGrant !== true ||
    !Number.isInteger(decision.settledChapterCount) || (decision.settledChapterCount as number) < 0 ||
    typeof decision.evaluatedAt !== "string" || !arraysValid || !fingerprintValid ||
    hash(base) !== decision.fingerprint
  ) throw new Error("ADAPTIVE_PAUSE_DECISION_INTEGRITY_FAILED");
  return decision as AdaptivePauseDecision;
}

export function evaluateAdaptivePause(input: {
  pausePolicyVersion: "adaptive-risk-pause.v1";
  autonomyGrantValid: boolean;
  unresolvedHardTriggers: readonly string[];
  keyReviewDisagreement: boolean;
  scopeExpansionRequested: boolean;
  retryBudgetExhausted: boolean;
  authorRequestedPause: boolean;
  settledChapterCount: number;
  volumeBoundary: boolean;
  majorClosure: boolean;
  materialRiskChange: boolean;
  evaluatedAt?: string;
}): AdaptivePauseDecision {
  if (!Number.isInteger(input.settledChapterCount) || input.settledChapterCount < 0) throw new Error("ADAPTIVE_PAUSE_SETTLED_COUNT_INVALID");
  const hardReasons = [...new Set(input.unresolvedHardTriggers.map((reason) => reason.trim()).filter(Boolean))];
  if (input.keyReviewDisagreement) hardReasons.push("key-review-disagreement");
  if (input.scopeExpansionRequested) hardReasons.push("scope-expansion-requested");
  if (input.retryBudgetExhausted) hardReasons.push("retry-budget-exhausted");
  if (input.authorRequestedPause) hardReasons.push("author-requested-pause");
  if (!input.autonomyGrantValid) hardReasons.push("autonomy-grant-invalid");
  const uniqueHardReasons = [...new Set(hardReasons)];
  const softTriggers: string[] = [];
  if (input.volumeBoundary) softTriggers.push("volume-boundary");
  if (input.settledChapterCount > 0 && input.settledChapterCount % 10 === 0) softTriggers.push("ten-settled-chapters");
  if (input.majorClosure) softTriggers.push("major-closure");
  if (input.materialRiskChange) softTriggers.push("material-risk-change");
  const status: AdaptivePauseStatus = uniqueHardReasons.length ? "hard_pause" : softTriggers.length ? "soft_recap" : "continue";
  const base = {
    schemaVersion: "adaptive-pause-decision.v1" as const,
    pausePolicyVersion: input.pausePolicyVersion,
    status,
    nextAction: status === "hard_pause" ? "pause_and_discuss" as const : status === "soft_recap" ? "emit_milestone_recap" as const : "continue_within_grant" as const,
    hardReasons: uniqueHardReasons,
    softTriggers,
    continuationRequiresExistingGrant: true as const,
    settledChapterCount: input.settledChapterCount,
    evaluatedAt: input.evaluatedAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}
