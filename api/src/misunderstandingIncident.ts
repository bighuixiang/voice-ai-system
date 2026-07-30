import crypto from "node:crypto";

export type MisunderstandingSignal = "author-correction" | "author-retraction" | "repeated-question" | "negative-feedback" | "execution-mismatch";
export type MisunderstandingLayer = "extraction" | "inference" | "questioning" | "memory" | "execution" | "presentation";
export interface MisunderstandingIncident {
  schemaVersion: "misunderstanding-incident.v1";
  incidentId: string;
  projectSlug: string;
  signal: MisunderstandingSignal;
  errorLayer: MisunderstandingLayer;
  priorInterpretation: string;
  correctedInterpretation: string;
  affectedAssets: string[];
  repairPlan: string;
  regressionCase: string;
  status: "open" | "resolved";
  repairEvidence?: string[];
  regressionResult?: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createMisunderstandingIncident(input: Omit<MisunderstandingIncident, "schemaVersion" | "status" | "fingerprint">): MisunderstandingIncident {
  if (!input.incidentId.trim() || !input.projectSlug.trim() || !input.priorInterpretation.trim() || !input.correctedInterpretation.trim() || !input.affectedAssets.length || !input.repairPlan.trim() || !input.regressionCase.trim()) throw new Error("MISUNDERSTANDING_FIELDS_REQUIRED");
  const base = { schemaVersion: "misunderstanding-incident.v1" as const, ...input, affectedAssets: [...input.affectedAssets], status: "open" as const };
  return { ...base, fingerprint: hash(base) };
}

export function resolveMisunderstandingIncident(incident: MisunderstandingIncident, input: { repairEvidence: string[]; regressionResult: string }): MisunderstandingIncident {
  if (!input.repairEvidence.length || !input.regressionResult.trim()) throw new Error("MISUNDERSTANDING_REPAIR_EVIDENCE_REQUIRED");
  const base = { ...incident, status: "resolved" as const, repairEvidence: [...input.repairEvidence], regressionResult: input.regressionResult };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}
