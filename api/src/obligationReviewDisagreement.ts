import crypto from "node:crypto";

export interface ObligationReviewDisagreement {
  schemaVersion: "obligation-review-disagreement.v1";
  obligationId: string;
  payoffRef: string;
  status: "resolved" | "needs_review";
  reviewerVerdicts: Array<{ reviewerId: string; verdict: "paid" | "not_paid" | "partial"; confidence: number; evidenceRefs: string[] }>;
  missingSubclaims: string[];
  confidenceInterval: [number, number];
  reasons: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateObligationReviewDisagreement(input: {
  obligationId: string;
  payoffRef: string;
  reviewerVerdicts: ReadonlyArray<{ reviewerId: string; verdict: "paid" | "not_paid" | "partial"; confidence: number; evidenceRefs: string[] }>;
  missingSubclaims: readonly string[];
}): ObligationReviewDisagreement {
  if (!input.obligationId.trim() || !input.payoffRef.trim() || input.reviewerVerdicts.length < 2) throw new Error("OBLIGATION_REVIEWERS_REQUIRED");
  if (input.reviewerVerdicts.some((item) => !item.reviewerId.trim() || !["paid", "not_paid", "partial"].includes(item.verdict) || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 || !item.evidenceRefs.length)) throw new Error("OBLIGATION_REVIEW_INVALID");
  const verdicts = input.reviewerVerdicts.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] }));
  const distinct = new Set(verdicts.map((item) => item.verdict));
  const missingSubclaims = [...new Set(input.missingSubclaims.map(String).filter(Boolean))];
  const needsReview = distinct.size > 1 || missingSubclaims.length > 0 || verdicts.some((item) => item.verdict !== "paid");
  const confidenceValues = verdicts.map((item) => item.confidence);
  const base = {
    schemaVersion: "obligation-review-disagreement.v1" as const,
    obligationId: input.obligationId,
    payoffRef: input.payoffRef,
    status: needsReview ? "needs_review" as const : "resolved" as const,
    reviewerVerdicts: verdicts,
    missingSubclaims,
    confidenceInterval: [Math.min(...confidenceValues), Math.max(...confidenceValues)] as [number, number],
    reasons: needsReview ? [...(distinct.size > 1 ? ["REVIEWER_VERDICTS_DIVERGE"] : []), ...(missingSubclaims.length ? ["SUBCLAIMS_UNANSWERED"] : []), ...(verdicts.some((item) => item.verdict !== "paid") ? ["PAYOFF_NOT_UNANIMOUSLY_PAID"] : [])] : []
  };
  return { ...base, fingerprint: hash(base) };
}
