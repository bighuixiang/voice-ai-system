import crypto from "node:crypto";

export type PrimaryActionKind = "safety-conflict" | "l2-decision" | "recovery" | "reviewable" | "continue" | "exploration";
export type PrimaryActionLifecycle = "ready" | "submitted" | "running" | "reviewable" | "blocked" | "failed" | "settled";
export interface PrimaryActionCandidate { actionId: string; kind: PrimaryActionKind; label: string; rationale: string; preconditions: string[]; targetOutcome: string; allowedCommands: string[]; risk: "low" | "medium" | "high"; lifecycle: "ready"; }
export interface PrimaryActionDecision {
  schemaVersion: "primary-action-decision.v1";
  actionId: string;
  journeyVersion: string;
  sourceFingerprint: string;
  kind: PrimaryActionKind;
  label: string;
  rationale: string;
  priorityEvidence: string[];
  preconditions: string[];
  blockingReasons: string[];
  targetOutcome: string;
  allowedCommands: string[];
  risk: "low" | "medium" | "high";
  idempotencyKey: string;
  lifecycle: PrimaryActionLifecycle;
  status: "ready" | "blocked";
  fingerprint: string;
}
const priority: Record<PrimaryActionKind, number> = { "safety-conflict": 0, "l2-decision": 1, recovery: 2, reviewable: 3, continue: 4, exploration: 5 };
const transitions: Record<PrimaryActionLifecycle, PrimaryActionLifecycle[]> = { ready: ["submitted", "blocked"], submitted: ["running", "failed", "blocked"], running: ["reviewable", "failed", "blocked", "settled"], reviewable: ["settled", "failed"], blocked: ["ready", "failed"], failed: ["ready"], settled: [] };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createPrimaryActionDecision(input: { journeyVersion: string; sourceFingerprint: string; candidates: readonly PrimaryActionCandidate[] }): PrimaryActionDecision {
  if (!input.journeyVersion.trim() || !input.sourceFingerprint.trim() || !input.candidates.length) throw new Error("PRIMARY_ACTION_CANDIDATES_REQUIRED");
  const selected = [...input.candidates].sort((a, b) => priority[a.kind] - priority[b.kind] || a.actionId.localeCompare(b.actionId))[0];
  const blockingReasons = [...selected.preconditions];
  const base = { schemaVersion: "primary-action-decision.v1" as const, actionId: selected.actionId, journeyVersion: input.journeyVersion, sourceFingerprint: input.sourceFingerprint, kind: selected.kind, label: selected.label, rationale: selected.rationale, priorityEvidence: [selected.kind], preconditions: [...selected.preconditions], blockingReasons, targetOutcome: selected.targetOutcome, allowedCommands: [...selected.allowedCommands], risk: selected.risk, idempotencyKey: `primary-action-${hash({ actionId: selected.actionId, journeyVersion: input.journeyVersion }).slice(0, 24)}`, lifecycle: blockingReasons.length ? "blocked" as const : "ready" as const, status: blockingReasons.length ? "blocked" as const : "ready" as const };
  return { ...base, fingerprint: hash(base) };
}

/**
 * Build the default action set from the server-owned journey state. Callers
 * may provide a reviewable result, but cannot replace the journey's blocking
 * question or turn an empty state into a random model command.
 */
export function resolvePrimaryActionDecision(input: {
  journeyVersion: string;
  sourceFingerprint: string;
  stage: "capture" | "understanding" | "blueprint-review" | "ready-for-outline";
  activeQuestionId?: string;
  reviewableActionId?: string;
  hasUnderstandingSnapshot?: boolean;
  hasUnderstandingReviewPassed?: boolean;
  contractDecisionId?: string;
  contractCandidateId?: string;
  contractAdoptionProposalId?: string;
  contractAdoptionProposalStatus?: "ready_for_authorization" | "blocked" | "committed";
  contractAdoptionCommitted?: boolean;
  blueprintConfirmed?: boolean;
  outlineSourceCandidateId?: string;
  outlineCandidateId?: string;
  outlineValidationPassed?: boolean;
  outlineAdoptionProposalId?: string;
  outlineAdoptionProposalStatus?: "ready_for_authorization" | "authorized" | "committed" | "blocked" | "rejected";
}): PrimaryActionDecision {
  const candidates: PrimaryActionCandidate[] = [];
  let hasPrimaryCandidate = false;
  const canAdvanceOutline = input.blueprintConfirmed === true || input.stage === "ready-for-outline";
  if (input.hasUnderstandingReviewPassed && input.contractAdoptionProposalId?.trim() && input.contractAdoptionProposalStatus === "ready_for_authorization" && !input.contractAdoptionCommitted) {
    candidates.push({ actionId: `commit-contract-adoption-${input.contractAdoptionProposalId}`, kind: "l2-decision", label: "确认并采纳故事设定", rationale: "故事设定采纳提案已准备完成；请先明确授权并写入正典，再继续处理大纲。", preconditions: [], targetOutcome: "story-contract-adopted", allowedCommands: ["authorize-contract-adoption", "reject-contract-adoption"], risk: "high", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (canAdvanceOutline && input.contractAdoptionCommitted && input.outlineAdoptionProposalId?.trim() && input.outlineAdoptionProposalStatus === "authorized") {
    candidates.push({ actionId: `commit-outline-adoption-${input.outlineAdoptionProposalId}`, kind: "l2-decision", label: "提交大纲采纳", rationale: "大纲采纳已获明确授权，提交前仍需校验指纹并生成执行就绪证明。", preconditions: [], targetOutcome: "outline-adopted", allowedCommands: ["commit-outline-adoption"], risk: "high", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (canAdvanceOutline && input.contractAdoptionCommitted && input.outlineAdoptionProposalId?.trim() && input.outlineAdoptionProposalStatus === "ready_for_authorization") {
    candidates.push({ actionId: `authorize-outline-adoption-${input.outlineAdoptionProposalId}`, kind: "l2-decision", label: "授权采纳大纲", rationale: "大纲采纳提案已准备，必须由作者明确授权后才能写入正典。", preconditions: [], targetOutcome: "outline-adoption-authorized", allowedCommands: ["authorize-outline-adoption", "reject-outline-adoption"], risk: "high", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (canAdvanceOutline && input.contractAdoptionCommitted && input.outlineCandidateId?.trim() && input.outlineValidationPassed) {
    candidates.push({ actionId: `propose-outline-adoption-${input.outlineCandidateId}`, kind: "reviewable", label: "提出大纲采纳", rationale: "大纲候选验证通过，先生成带章节选择和验证指纹的采纳提案，不直接写入正典。", preconditions: [], targetOutcome: "outline-adoption-proposed", allowedCommands: ["propose-outline-adoption", "reject-outline-candidate"], risk: "medium", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (canAdvanceOutline && input.contractAdoptionCommitted && input.outlineCandidateId?.trim()) {
    candidates.push({ actionId: `review-outline-candidate-${input.outlineCandidateId}`, kind: "reviewable", label: "审阅大纲候选", rationale: "契约已写入正典，大纲候选已生成，先审阅结构与因果链再继续。", preconditions: [], targetOutcome: "outline-candidate-reviewed", allowedCommands: ["review-outline-candidate", "propose-outline-adoption"], risk: "medium", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (canAdvanceOutline && (input.contractAdoptionCommitted || input.stage === "ready-for-outline") && input.outlineSourceCandidateId?.trim()) {
    candidates.push({ actionId: `generate-outline-candidate-${input.outlineSourceCandidateId}`, kind: "continue", label: "生成大纲候选", rationale: "故事蓝图已确认，下一步生成可审阅的大纲候选，不直接写入正典。", preconditions: [], targetOutcome: "outline-candidate-created", allowedCommands: ["compile-outline-candidate", "review-outline-candidate"], risk: "medium", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (input.hasUnderstandingReviewPassed && input.contractAdoptionProposalId?.trim() && input.contractAdoptionProposalStatus === "ready_for_authorization" && !input.contractAdoptionCommitted) {
    candidates.push({ actionId: `commit-contract-adoption-${input.contractAdoptionProposalId}`, kind: "l2-decision", label: "授权采纳契约", rationale: "采纳提案已准备，必须由明确授权决定是否写入正典。", preconditions: [], targetOutcome: "story-contract-adopted", allowedCommands: ["authorize-contract-adoption", "reject-contract-adoption"], risk: "high", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if ((input.hasUnderstandingReviewPassed || input.stage === "blueprint-review") && input.contractCandidateId?.trim()) {
    candidates.push({ actionId: `review-contract-candidate-${input.contractCandidateId}`, kind: "reviewable", label: "审阅契约候选", rationale: "候选已生成，先比较字段、假设和未决项，再决定是否提出采纳。", preconditions: [], targetOutcome: "contract-candidate-reviewed", allowedCommands: ["review-contract-candidate", "propose-contract-adoption", "reject-contract-candidate"], risk: "medium", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (input.hasUnderstandingReviewPassed && input.contractDecisionId?.trim()) {
    candidates.push({ actionId: `generate-contract-candidate-${input.contractDecisionId}`, kind: "continue", label: "生成契约候选", rationale: "理解审阅已通过且已有作者决策，先生成可审阅候选，不直接写入正典。", preconditions: [], targetOutcome: "story-contract-candidate-created", allowedCommands: ["compile-contract-candidate", "review-contract-candidate"], risk: "medium", lifecycle: "ready" });
    hasPrimaryCandidate = true;
  } else if (input.reviewableActionId?.trim() || input.hasUnderstandingSnapshot) {
    const actionId = input.reviewableActionId?.trim() || "review-understanding";
    candidates.push({ actionId, kind: "reviewable", label: "审阅理解结果", rationale: "理解快照已生成，应先让作者确认系统理解再继续派生资产。", preconditions: [], targetOutcome: "understanding-reviewed", allowedCommands: ["review-understanding", "accept-understanding", "correct-understanding"], risk: "medium", lifecycle: "ready" });
  }
  if (input.stage === "capture") {
    candidates.push({ actionId: "capture-idea", kind: "exploration", label: "记录你的想法", rationale: "尚无原话输入，先捕获作者意图。", preconditions: [], targetOutcome: "author-utterance-captured", allowedCommands: ["capture-author-message"], risk: "low", lifecycle: "ready" });
  } else if (input.activeQuestionId?.trim()) {
    candidates.push({ actionId: `answer-${input.activeQuestionId}`, kind: "l2-decision", label: "回答当前唯一问题", rationale: "当前问题会改变后续故事方向，必须先完成该决定。", preconditions: [], targetOutcome: "dialogue-question-answered", allowedCommands: ["answer-dialogue-question", "delegate-dialogue-question"], risk: "high", lifecycle: "ready" });
  } else if (!hasPrimaryCandidate) {
    candidates.push({ actionId: "continue-understanding", kind: "continue", label: "继续推进理解", rationale: "没有待作者决定的高影响问题，继续生成下一个可审阅成果。", preconditions: [], targetOutcome: "next-understanding-result", allowedCommands: ["continue-journey"], risk: "low", lifecycle: "ready" });
  }
  return createPrimaryActionDecision({ journeyVersion: input.journeyVersion, sourceFingerprint: input.sourceFingerprint, candidates });
}

export function validatePrimaryActionSubmission(decision: PrimaryActionDecision, input: { actionId: string; journeyVersion: string; sourceFingerprint: string }): { accepted: boolean; reason?: "action-mismatch" | "journey-stale" | "source-stale" | "decision-blocked"; idempotencyKey?: string } {
  if (decision.actionId !== input.actionId) return { accepted: false, reason: "action-mismatch" };
  if (decision.journeyVersion !== input.journeyVersion) return { accepted: false, reason: "journey-stale" };
  if (decision.sourceFingerprint !== input.sourceFingerprint) return { accepted: false, reason: "source-stale" };
  if (decision.status === "blocked" || decision.lifecycle === "blocked") return { accepted: false, reason: "decision-blocked" };
  return { accepted: true, idempotencyKey: decision.idempotencyKey };
}

export function advancePrimaryAction(decision: PrimaryActionDecision, next: PrimaryActionLifecycle): PrimaryActionDecision {
  if (!transitions[decision.lifecycle].includes(next)) throw new Error("PRIMARY_ACTION_LIFECYCLE_INVALID");
  const base = { ...decision, lifecycle: next, status: next === "blocked" ? "blocked" as const : "ready" as const };
  return { ...base, fingerprint: hash(base) };
}
