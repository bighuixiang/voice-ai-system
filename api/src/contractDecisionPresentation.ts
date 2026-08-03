import crypto from "node:crypto";

export interface DecisionCostPreview {
  schemaVersion: "decision-cost-preview.v1";
  optionId: string;
  storyEffect: string;
  affectedChapters: string[];
  expectedRework: string;
  reversibility: "easy" | "bounded" | "hard";
  setupPayoffCost: string;
  waitingCost: string;
  technicalDetails: string[];
  fingerprint: string;
}

export interface ReviewCompression {
  schemaVersion: "review-compression.v1";
  objective: string;
  recommendation: string;
  mustKeep: string[];
  strongestRedRisk: string;
  actualChanges: string[];
  decisionRequired: string[];
  passedSummary: { count: number; evidenceRefs: string[] };
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createDecisionCostPreview(input: Omit<DecisionCostPreview, "schemaVersion" | "fingerprint">): DecisionCostPreview {
  if (!input.optionId.trim() || !input.storyEffect.trim() || !input.affectedChapters.length || !input.expectedRework.trim() || !input.setupPayoffCost.trim() || !input.waitingCost.trim()) throw new Error("DECISION_COST_PREVIEW_FIELDS_REQUIRED");
  const base = { schemaVersion: "decision-cost-preview.v1" as const, ...input, affectedChapters: [...input.affectedChapters], technicalDetails: [...input.technicalDetails] };
  return { ...base, fingerprint: hash(base) };
}

export function createReviewCompression(input: Omit<ReviewCompression, "schemaVersion" | "fingerprint">): ReviewCompression {
  if (!input.objective.trim() || !input.recommendation.trim() || !input.strongestRedRisk.trim() || !input.passedSummary.evidenceRefs.length) throw new Error("REVIEW_COMPRESSION_FIELDS_REQUIRED");
  if (input.passedSummary.count < 0 || !Number.isInteger(input.passedSummary.count)) throw new Error("REVIEW_COMPRESSION_COUNT_INVALID");
  const base = { schemaVersion: "review-compression.v1" as const, ...input, mustKeep: [...input.mustKeep], actualChanges: [...input.actualChanges], decisionRequired: [...input.decisionRequired], passedSummary: { count: input.passedSummary.count, evidenceRefs: [...input.passedSummary.evidenceRefs] } };
  return { ...base, fingerprint: hash(base) };
}
