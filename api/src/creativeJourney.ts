import { createHash } from "node:crypto";
import type { CreativeSession } from "./creativeSession.js";
import { buildUnderstandingPreview } from "./understandingPreview.js";
import { UNDERSTANDING_QUESTION_SEQUENCE } from "./understandingQuestionSequence.js";

interface JourneyQuestion {
  id: string;
  text: string;
  status: "candidate" | "active";
  impact: "low" | "medium" | "high";
  source: "deterministic-gap" | "model-gap";
}

export type CreativeJourneyStage = "capture" | "understanding" | "blueprint-review" | "ready-for-outline";

export interface CreativeJourneyAction {
  id: "capture-idea" | "review-understanding" | "generate-outline" | `answer-${string}`;
  label: string;
  kind: "capture" | "review" | "answer" | "continue";
  status: "available";
}

export interface CreativeJourneyProjection {
  schemaVersion: "creative-journey-projection.v1";
  projectSlug: string;
  stage: CreativeJourneyStage;
  primaryAsset: "creative-session" | "understanding-preview";
  blockingRef?: string;
  primaryAction: CreativeJourneyAction;
  activeQuestion?: JourneyQuestion;
  progress: { completed: number; total: number; current: number };
  nextInstruction: string;
  sourceMessageIds: string[];
  sessionFingerprint: string;
  sourceFingerprint: string;
  projectionVersion: string;
  freshness: "current" | "rebuilding" | "conflicted";
  unsavedState: { hasDraft: boolean; fingerprint?: string };
  pendingRefs: string[];
  fingerprint: string;
}

export interface CreativeJourneyDialogueState {
  activeQuestion?: { questionId: string; text: string; impact?: "low" | "medium" | "high"; source: "deterministic-gap" | "model-gap" };
  answeredQuestionIds?: string[];
  readyForOutline?: boolean;
}

function fingerprintSession(session: CreativeSession): string {
  return createHash("sha256")
    .update(JSON.stringify({ schemaVersion: session.schemaVersion, projectSlug: session.projectSlug, messages: session.messages }))
    .digest("hex");
}

export function buildCreativeJourneyProjection(session: CreativeSession, dialogueState: CreativeJourneyDialogueState = {}): CreativeJourneyProjection {
  const sourceMessageIds = session.messages.map((message) => message.id);
  const sourceFingerprint = fingerprintSession(session);
  const projectionVersion = createHash("sha256").update(JSON.stringify({ sourceFingerprint, sourceMessageIds })).digest("hex").slice(0, 24);
  const base = {
    schemaVersion: "creative-journey-projection.v1" as const,
    projectSlug: session.projectSlug,
    sourceMessageIds,
    sessionFingerprint: sourceFingerprint,
    sourceFingerprint,
    projectionVersion,
    freshness: "current" as const,
    unsavedState: { hasDraft: false, ...(typeof (session as Partial<CreativeSession>).latestDirection === "string" && (session as Partial<CreativeSession>).latestDirection ? { fingerprint: createHash("sha256").update((session as Partial<CreativeSession>).latestDirection || "").digest("hex") } : {}) },
    pendingRefs: [...((session as Partial<CreativeSession>).pendingPatchRefs || []), ...((session as Partial<CreativeSession>).decisionRefs || [])]
  };
  if (session.messages.length === 0) {
    const result: Omit<CreativeJourneyProjection, "fingerprint"> = {
      ...base,
      stage: "capture",
      primaryAsset: "creative-session",
      primaryAction: { id: "capture-idea", label: "告诉我你的想法", kind: "capture", status: "available" },
      progress: { completed: 0, total: UNDERSTANDING_QUESTION_SEQUENCE.length, current: 1 },
      nextInstruction: "请先用自己的话描述想创作的故事。"
    };
    return { ...result, fingerprint: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
  }

  const preview = buildUnderstandingPreview(session);
  const answeredQuestionIds = new Set((dialogueState.answeredQuestionIds || []).filter((questionId) => UNDERSTANDING_QUESTION_SEQUENCE.some((question) => question.questionId === questionId)));
  const completed = answeredQuestionIds.size;
  const progress = { completed, total: UNDERSTANDING_QUESTION_SEQUENCE.length, current: Math.min(completed + 1, UNDERSTANDING_QUESTION_SEQUENCE.length) };
  if (completed === UNDERSTANDING_QUESTION_SEQUENCE.length) {
    const stage: CreativeJourneyStage = dialogueState.readyForOutline ? "ready-for-outline" : "blueprint-review";
    const result: Omit<CreativeJourneyProjection, "fingerprint"> = {
      ...base,
      stage,
      primaryAsset: "understanding-preview",
      primaryAction: dialogueState.readyForOutline
        ? { id: "generate-outline", label: "生成故事大纲", kind: "continue", status: "available" }
        : { id: "review-understanding", label: "审阅故事设定候选", kind: "review", status: "available" },
      progress,
      nextInstruction: dialogueState.readyForOutline ? "故事设定已确认，可以开始生成大纲。" : "十个关键问题已确认，请审阅故事设定候选。",
      sessionFingerprint: preview.inputFingerprint
    };
    return { ...result, fingerprint: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
  }
  const activeQuestion = dialogueState.activeQuestion
    ? { id: dialogueState.activeQuestion.questionId, text: dialogueState.activeQuestion.text, status: "active" as const, impact: dialogueState.activeQuestion.impact ?? "high", source: dialogueState.activeQuestion.source }
    : answeredQuestionIds.has("question-primary-desire")
      ? undefined
      : { id: "question-primary-desire", text: "在开头阶段，主角最想得到什么？", status: "candidate" as const, impact: "high" as const, source: "deterministic-gap" as const };
  const result: Omit<CreativeJourneyProjection, "fingerprint"> = {
    ...base,
    stage: "understanding",
    primaryAsset: "understanding-preview",
    blockingRef: "question-primary-desire",
    primaryAction: dialogueState.activeQuestion
      ? { id: `answer-${dialogueState.activeQuestion.questionId}`, label: "回答当前问题", kind: "answer", status: "available" }
      : { id: "review-understanding", label: "确认原始输入并生成问题", kind: "review", status: "available" },
    progress,
    nextInstruction: dialogueState.activeQuestion ? "请回答当前这个关键问题。" : completed === 0 ? "请确认原始输入并生成第一个关键问题。" : "请继续确认下一个关键问题。",
    ...(activeQuestion ? { activeQuestion } : {}),
    sessionFingerprint: preview.inputFingerprint
  };
  return { ...result, fingerprint: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
}

export function assessJourneyFreshness(projection: CreativeJourneyProjection, current: { sourceFingerprint: string; projectionVersion: string }): { freshness: CreativeJourneyProjection["freshness"]; primaryAction: "continue" | "reconcile" } {
  if (projection.sourceFingerprint !== current.sourceFingerprint) return { freshness: "conflicted", primaryAction: "reconcile" };
  if (projection.projectionVersion !== current.projectionVersion) return { freshness: "rebuilding", primaryAction: "reconcile" };
  return { freshness: "current", primaryAction: "continue" };
}
