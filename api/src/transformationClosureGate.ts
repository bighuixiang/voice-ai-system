import crypto from "node:crypto";

export interface TransformationClosureGate { schemaVersion: "transformation-closure-gate.v1"; transformationId: string; status: "passed" | "blocked"; overduePreserved: boolean; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateTransformationClosure(input: { transformationId: string; priorStatus: "within" | "risk" | "overdue" | "resolved"; mainlineSubclaimsAnswered: boolean; readerFairnessEvidence: readonly string[]; sequelInheritanceVerified: boolean; authorAuthorized: boolean }): TransformationClosureGate {
  if (!input.transformationId.trim()) throw new Error("TRANSFORMATION_GATE_FIELDS_REQUIRED");
  const reasons: string[] = [];
  if (!input.mainlineSubclaimsAnswered) reasons.push("MAINLINE_SUBCLAIMS_INCOMPLETE");
  if (!input.readerFairnessEvidence.length) reasons.push("READER_FAIRNESS_EVIDENCE_REQUIRED");
  if (!input.sequelInheritanceVerified) reasons.push("SEQUEL_INHERITANCE_UNVERIFIED");
  if (!input.authorAuthorized) reasons.push("AUTHOR_AUTHORIZATION_REQUIRED");
  const blocked = reasons.length > 0;
  const base = { schemaVersion: "transformation-closure-gate.v1" as const, transformationId: input.transformationId, status: blocked ? "blocked" as const : "passed" as const, overduePreserved: input.priorStatus === "overdue", reasons };
  return { ...base, fingerprint: hash(base) };
}
