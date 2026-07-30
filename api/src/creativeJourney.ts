import { createHash } from "node:crypto";
import type { CreativeSession } from "./creativeSession.js";
import { buildUnderstandingPreview } from "./understandingPreview.js";

interface JourneyQuestion {
  id: "question-primary-desire";
  text: string;
  status: "candidate";
  impact: "high";
  source: "deterministic-gap" | "model-gap";
}

export type CreativeJourneyStage = "capture" | "understanding";

export interface CreativeJourneyAction {
  id: "capture-idea" | "review-understanding";
  label: string;
  kind: "capture" | "review";
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
}

function fingerprintSession(session: CreativeSession): string {
  return createHash("sha256")
    .update(JSON.stringify({ schemaVersion: session.schemaVersion, projectSlug: session.projectSlug, messages: session.messages }))
    .digest("hex");
}

export function buildCreativeJourneyProjection(session: CreativeSession): CreativeJourneyProjection {
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
    return {
      ...base,
      stage: "capture",
      primaryAsset: "creative-session",
      primaryAction: { id: "capture-idea", label: "告诉我你的想法", kind: "capture", status: "available" }
    };
  }

  const preview = buildUnderstandingPreview(session);
  return {
    ...base,
    stage: "understanding",
    primaryAsset: "understanding-preview",
    blockingRef: "question-primary-desire",
    primaryAction: { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
    activeQuestion: {
      id: "question-primary-desire",
      text: "What must the protagonist want most in the opening movement?",
      status: "candidate",
      impact: "high",
      source: "deterministic-gap"
    },
    sessionFingerprint: preview.inputFingerprint
  };
}

export function assessJourneyFreshness(projection: CreativeJourneyProjection, current: { sourceFingerprint: string; projectionVersion: string }): { freshness: CreativeJourneyProjection["freshness"]; primaryAction: "continue" | "reconcile" } {
  if (projection.sourceFingerprint !== current.sourceFingerprint) return { freshness: "conflicted", primaryAction: "reconcile" };
  if (projection.projectionVersion !== current.projectionVersion) return { freshness: "rebuilding", primaryAction: "reconcile" };
  return { freshness: "current", primaryAction: "continue" };
}
