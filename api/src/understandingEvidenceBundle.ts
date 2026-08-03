import crypto from "node:crypto";

export type EvidenceStatus = "explicit" | "inferred" | "provisional" | "unknown" | "conflicted";
export interface UnderstandingEvidenceBundle { schemaVersion: "understanding-evidence-bundle.v1"; claimId: string; status: EvidenceStatus; confidenceInterval: [number, number]; supportingEvidenceRefs: string[]; opposingEvidenceRefs: string[]; interpreterVersion: string; promptVersion: string; alternatives: string[]; sourceMessageIds: string[]; gateStatus: "passed"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateUnderstandingEvidenceBundle(input: Omit<UnderstandingEvidenceBundle, "schemaVersion" | "gateStatus" | "fingerprint">): UnderstandingEvidenceBundle {
  if (!input.claimId.trim() || !input.interpreterVersion.trim() || !input.promptVersion.trim() || !input.sourceMessageIds.length || !input.alternatives.length) throw new Error("UNDERSTANDING_EVIDENCE_FIELDS_REQUIRED");
  const [lower, upper] = input.confidenceInterval;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 1 || lower > upper) throw new Error("UNDERSTANDING_CONFIDENCE_INTERVAL_INVALID");
  if (input.status !== "explicit" && input.status !== "unknown" && !input.supportingEvidenceRefs.length) throw new Error("UNDERSTANDING_SUPPORTING_EVIDENCE_REQUIRED");
  if (input.status === "inferred" || input.status === "provisional" || input.status === "conflicted") {
    if (!input.opposingEvidenceRefs.length) throw new Error("UNDERSTANDING_OPPOSING_EVIDENCE_REQUIRED");
  }
  const base = { schemaVersion: "understanding-evidence-bundle.v1" as const, ...input, confidenceInterval: [lower, upper] as [number, number], supportingEvidenceRefs: [...input.supportingEvidenceRefs], opposingEvidenceRefs: [...input.opposingEvidenceRefs], alternatives: [...input.alternatives], sourceMessageIds: [...input.sourceMessageIds], gateStatus: "passed" as const };
  return { ...base, fingerprint: hash(base) };
}
