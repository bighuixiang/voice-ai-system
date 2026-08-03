import crypto from "node:crypto";
import { createFeedbackAttribution, derivePreferenceHypothesis, type FeedbackAttribution, type FeedbackCategory, type PreferenceHypothesis } from "./feedbackLearning.js";
import { readCraftFeedbackEvent, type CraftFeedbackEvent } from "./craftFeedback.js";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function createCraftFeedbackAttribution(input: {
  root: string;
  feedbackId: string;
  projectSlug?: string;
  pattern: string;
  category: FeedbackCategory;
  scope: { chapterId?: string; sceneId?: string };
}): Promise<FeedbackAttribution> {
  if (!input.pattern.trim()) throw new Error("CRAFT_FEEDBACK_LEARNING_PATTERN_REQUIRED");
  const event = await readCraftFeedbackEvent(input.root, input.feedbackId);
  if (!event) throw new Error("CRAFT_FEEDBACK_LEARNING_EVIDENCE_REQUIRED");
  if (input.projectSlug !== undefined && event.projectSlug !== input.projectSlug.trim()) throw new Error("CRAFT_FEEDBACK_LEARNING_PROJECT_MISMATCH");
  const synthetic = toAuthorFeedbackEvent(event);
  return createFeedbackAttribution({
    root: input.root,
    event: synthetic,
    category: input.category,
    pattern: input.pattern,
    scope: input.scope,
    evidenceRefs: [`craft-feedback://${event.feedbackId}`],
    confounders: event.confounders,
    confidence: event.outcome === "accepted" ? { lower: 0.4, upper: 0.7 } : { lower: 0.5, upper: 0.9 }
  });
}

export async function deriveCraftFeedbackPreference(input: { root: string; attribution: FeedbackAttribution }): Promise<PreferenceHypothesis> {
  return derivePreferenceHypothesis(input);
}

function toAuthorFeedbackEvent(event: CraftFeedbackEvent) {
  const base = {
    schemaVersion: "author-feedback-event.v1" as const,
    eventId: event.feedbackId,
    projectSlug: event.projectSlug,
    candidateId: `craft-treatment:${event.experimentId}`,
    adoptionTransactionId: `craft-experiment:${event.experimentId}`,
    decision: event.outcome === "accepted" ? "accepted" as const : event.outcome === "rejected" ? "rejected" as const : "needs_revision" as const,
    note: event.note,
    reasonCode: "provided" as const,
    createdAt: event.createdAt
  };
  return { ...base, fingerprint: hash(base) };
}
