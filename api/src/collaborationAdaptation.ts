import crypto from "node:crypto";

export type CollaborationMode = "unchanged" | "more-automatic" | "more-detail";
export interface CollaborationAdjustment {
  schemaVersion: "collaboration-adjustment.v1";
  mode: CollaborationMode;
  scope: "none" | "explanation-detail" | "review-evidence" | "candidate-batch-size";
  reasonCodes: string[];
  reversible: true;
  permanent: false;
  importantGatesProtected: true;
  fingerprint: string;
}

type Observations = { skippedExplanations: number; corrections: number; evidenceOpened: number; candidateRejections: number };
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertCollaborationAdjustmentIntegrity(adjustment: CollaborationAdjustment): void {
  if (adjustment.schemaVersion !== "collaboration-adjustment.v1" || !["unchanged", "more-automatic", "more-detail"].includes(adjustment.mode) || !["none", "explanation-detail", "review-evidence", "candidate-batch-size"].includes(adjustment.scope) || adjustment.reversible !== true || adjustment.permanent !== false || adjustment.importantGatesProtected !== true || !Array.isArray(adjustment.reasonCodes) || adjustment.reasonCodes.some((code) => !code.trim())) throw new Error("COLLABORATION_ADJUSTMENT_INVALID");
  const { fingerprint: _fingerprint, ...base } = adjustment;
  if (!/^[a-f0-9]{64}$/i.test(adjustment.fingerprint) || hash(base) !== adjustment.fingerprint) throw new Error("COLLABORATION_ADJUSTMENT_INTEGRITY_FAILED");
}

const finalize = (base: Omit<CollaborationAdjustment, "fingerprint">): CollaborationAdjustment => ({ ...base, fingerprint: hash(base) });

export function proposeCollaborationAdjustment(input: { observations: Observations; explicitStrategy?: "more-automatic" | "more-detail" }): CollaborationAdjustment {
  const values = Object.values(input.observations);
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) throw new Error("COLLABORATION_OBSERVATIONS_INVALID");
  if (input.explicitStrategy === "more-detail") return finalize({ schemaVersion: "collaboration-adjustment.v1", mode: "more-detail", scope: "review-evidence", reasonCodes: ["EXPLICIT_AUTHOR_STRATEGY"], reversible: true, permanent: false, importantGatesProtected: true });
  if (input.explicitStrategy === "more-automatic") return finalize({ schemaVersion: "collaboration-adjustment.v1", mode: "more-automatic", scope: "candidate-batch-size", reasonCodes: ["EXPLICIT_AUTHOR_STRATEGY"], reversible: true, permanent: false, importantGatesProtected: true });
  const reasonCodes: string[] = [];
  if (input.observations.skippedExplanations >= 2) reasonCodes.push("REPEATED_EXPLANATION_SKIPS");
  if (input.observations.corrections >= 3) reasonCodes.push("REPEATED_CORRECTIONS");
  if (input.observations.evidenceOpened >= 3) reasonCodes.push("REPEATED_EVIDENCE_OPENS");
  if (input.observations.candidateRejections >= 3) reasonCodes.push("REPEATED_CANDIDATE_REJECTIONS");
  if (reasonCodes.includes("REPEATED_EXPLANATION_SKIPS") && !reasonCodes.includes("REPEATED_CORRECTIONS")) return finalize({ schemaVersion: "collaboration-adjustment.v1", mode: "more-automatic", scope: "explanation-detail", reasonCodes, reversible: true, permanent: false, importantGatesProtected: true });
  if (reasonCodes.length) return finalize({ schemaVersion: "collaboration-adjustment.v1", mode: "more-detail", scope: "review-evidence", reasonCodes, reversible: true, permanent: false, importantGatesProtected: true });
  return finalize({ schemaVersion: "collaboration-adjustment.v1", mode: "unchanged", scope: "none", reasonCodes, reversible: true, permanent: false, importantGatesProtected: true });
}
