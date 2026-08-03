export interface QuestionTimeoutGrant { grantId: string; scope: string[]; allowedActions: string[]; expiresAt: string; status: "active" | "revoked"; }
export function evaluateQuestionTimeout(input: { questionId: string; level: "L0" | "L1" | "L2"; waitedDays: number; grant?: QuestionTimeoutGrant; now: string; requestedAction: string }): { status: "gate_required" | "continue_authorized"; canCompleteUnrelatedWork: true; reason: string } {
  if (!input.questionId.trim() || input.waitedDays < 0 || !input.requestedAction.trim()) throw new Error("QUESTION_TIMEOUT_FIELDS_REQUIRED");
  const grantValid = input.grant?.status === "active" && input.grant.scope.includes(input.questionId) && input.grant.allowedActions.includes(input.requestedAction) && new Date(input.grant.expiresAt).getTime() > new Date(input.now).getTime();
  if (input.level === "L2" && input.waitedDays >= 7 && !grantValid) return { status: "gate_required", canCompleteUnrelatedWork: true, reason: "L2_TIMEOUT_NEVER_AUTO_ACCEPTS" };
  if (input.level === "L2" && input.waitedDays >= 7 && grantValid) return { status: "continue_authorized", canCompleteUnrelatedWork: true, reason: "ACTIVE_UNEXPIRED_DELEGATION_COVERS_QUESTION" };
  return { status: "gate_required", canCompleteUnrelatedWork: true, reason: "QUESTION_REMAINS_UNRESOLVED" };
}
