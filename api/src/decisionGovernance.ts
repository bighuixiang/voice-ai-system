import crypto from "node:crypto";

export interface DecisionEscalation { schemaVersion: "decision-escalation.v1"; escalationId: string; projectSlug: string; decisionType: string; impact: string; irreversibility: string; currentEvidence: string[]; safeDefaults: string[]; delayCost: string; thresholdReason: string; level: "L0" | "L1" | "L2"; status: "auto" | "recommended" | "needs-author"; fingerprint: string; }
export interface AutonomyReceipt { schemaVersion: "autonomy-receipt.v1"; receiptId: string; projectSlug: string; scope: string[]; level: "L0" | "L1"; evidenceRefs: string[]; expiresAt: string; revocationPhrase: string; status: "active" | "revoked"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createDecisionEscalation(input: Omit<DecisionEscalation, "schemaVersion" | "level" | "status" | "fingerprint">): DecisionEscalation {
  if (!input.escalationId.trim() || !input.projectSlug.trim() || !input.decisionType.trim() || !input.impact.trim() || !input.irreversibility.trim() || !input.currentEvidence.length || !input.safeDefaults.length || !input.thresholdReason.trim()) throw new Error("DECISION_ESCALATION_FIELDS_REQUIRED");
  const high = /core|ending|published|cannot|irrevers|rights|privacy|budget/iu.test(`${input.decisionType} ${input.irreversibility} ${input.impact}`);
  const medium = /important|chapter|relationship|world/iu.test(`${input.decisionType} ${input.impact}`);
  const level = high ? "L2" as const : medium ? "L1" as const : "L0" as const;
  const base = { schemaVersion: "decision-escalation.v1" as const, ...input, currentEvidence: [...input.currentEvidence], safeDefaults: [...input.safeDefaults], level, status: level === "L2" ? "needs-author" as const : level === "L1" ? "recommended" as const : "auto" as const };
  return { ...base, fingerprint: hash(base) };
}
export function createAutonomyReceipt(input: Omit<AutonomyReceipt, "schemaVersion" | "status" | "fingerprint">): AutonomyReceipt {
  if (input.level === "L2") throw new Error("AUTONOMY_L2_FORBIDDEN");
  if (!input.receiptId.trim() || !input.projectSlug.trim() || !input.scope.length || !input.evidenceRefs.length || !input.expiresAt.trim()) throw new Error(input.expiresAt.trim() ? "AUTONOMY_RECEIPT_FIELDS_REQUIRED" : "AUTONOMY_EXPIRY_REQUIRED");
  if (new Date(input.expiresAt).getTime() <= Date.now()) throw new Error("AUTONOMY_EXPIRY_INVALID");
  const base = { schemaVersion: "autonomy-receipt.v1" as const, ...input, scope: [...input.scope], evidenceRefs: [...input.evidenceRefs], status: "active" as const };
  return { ...base, fingerprint: hash(base) };
}
export function revokeAutonomyReceipt(receipt: AutonomyReceipt, phrase: string): AutonomyReceipt {
  if (phrase.trim() !== receipt.revocationPhrase) throw new Error("AUTONOMY_REVOCATION_PHRASE_INVALID");
  const base = { ...receipt, status: "revoked" as const };
  return { ...base, fingerprint: hash(base) };
}
