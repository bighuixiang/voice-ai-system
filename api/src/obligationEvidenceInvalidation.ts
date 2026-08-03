import crypto from "node:crypto";

export type EvidenceInvalidationStatus = "current" | "evidence_invalidated";
export interface ObligationEvidenceInvalidation {
  schemaVersion: "obligation-evidence-invalidation.v1";
  obligationId: string;
  priorStatus: "proposed" | "confirmed" | "planned" | "setup" | "reminder" | "escalated" | "partially_paid" | "paid";
  status: EvidenceInvalidationStatus;
  deletedEvidenceRefs: string[];
  relocatedEvidenceRefs: string[];
  staleArtifactRefs: string[];
  reasons: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateObligationEvidenceInvalidation(input: {
  obligationId: string;
  priorStatus: ObligationEvidenceInvalidation["priorStatus"];
  setupEvidenceRefs: readonly string[];
  currentEvidenceRefs: readonly string[];
  sameTermRefs?: readonly string[];
}): ObligationEvidenceInvalidation {
  if (!input.obligationId.trim() || !input.setupEvidenceRefs.length) throw new Error("OBLIGATION_SETUP_EVIDENCE_REQUIRED");
  const original = [...new Set(input.setupEvidenceRefs.map(String).filter(Boolean))];
  const current = new Set(input.currentEvidenceRefs.map(String).filter(Boolean));
  const deletedEvidenceRefs = original.filter((ref) => !current.has(ref));
  const relocatedEvidenceRefs = original.filter((ref) => current.has(ref));
  const invalidated = deletedEvidenceRefs.length > 0;
  const reasons = invalidated ? ["ORIGINAL_SETUP_ANCHOR_MISSING", ...(input.sameTermRefs?.length ? ["SAME_TERM_IS_NOT_RELOCATION_EVIDENCE"] : [])] : [];
  const base = {
    schemaVersion: "obligation-evidence-invalidation.v1" as const,
    obligationId: input.obligationId,
    priorStatus: input.priorStatus,
    status: invalidated ? "evidence_invalidated" as const : "current" as const,
    deletedEvidenceRefs,
    relocatedEvidenceRefs,
    staleArtifactRefs: invalidated ? [`obligation://payoff/${input.obligationId}`, `completion://obligation/${input.obligationId}`] : [],
    reasons
  };
  return { ...base, fingerprint: hash(base) };
}
