import { createHash } from "node:crypto";
import type { CreativeSession } from "./creativeSession.js";
import { buildUnderstandingPreview } from "./understandingPreview.js";

interface JourneyQuestion {
  id: string;
  text: string;
  status: "candidate" | "active";
  impact: "high";
  source: "deterministic-gap" | "model-gap";
}

export type CreativeJourneyStage = "capture" | "understanding";

export interface CreativeJourneyAction {
  id: "capture-idea" | "review-understanding" | `answer-${string}`;
  label: string;
  kind: "capture" | "review" | "answer";
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
  activeQuestion?: { questionId: string; text: string; source: "deterministic-gap" | "model-gap" };
  answeredQuestionIds?: string[];
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
      primaryAction: { id: "capture-idea", label: "告诉我你的想法", kind: "capture", status: "available" }
    };
    return { ...result, fingerprint: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
  }

  const preview = buildUnderstandingPreview(session);
  const answeredQuestionIds = new Set(dialogueState.answeredQuestionIds || []);
  const activeQuestion = dialogueState.activeQuestion
    ? { id: dialogueState.activeQuestion.questionId, text: dialogueState.activeQuestion.text, status: "active" as const, impact: "high" as const, source: dialogueState.activeQuestion.source }
    : answeredQuestionIds.has("question-primary-desire")
      ? undefined
      : { id: "question-primary-desire", text: "What must the protagonist want most in the opening movement?", status: "candidate" as const, impact: "high" as const, source: "deterministic-gap" as const };
  const result: Omit<CreativeJourneyProjection, "fingerprint"> = {
    ...base,
    stage: "understanding",
    primaryAsset: "understanding-preview",
    blockingRef: "question-primary-desire",
    primaryAction: dialogueState.activeQuestion
      ? { id: `answer-${dialogueState.activeQuestion.questionId}`, label: "回答当前问题", kind: "answer", status: "available" }
      : { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
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
