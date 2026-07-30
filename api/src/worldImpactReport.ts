import crypto from "node:crypto";

export type WorldChangeType = "world-rule" | "capability" | "resource" | "location" | "organization" | "time-fact";
export interface WorldImpactReport { schemaVersion: "world-impact-report.v1"; reportId: string; changeType: WorldChangeType; changedId: string; changedSummary: string; affected: { characterChoices: string[]; causality: string[]; outline: string[]; proseCandidates: string[]; knowledge: string[]; obligations: string[]; readerExperience: string[]; ending: string[] }; protectedUnrelatedCanon: string[]; status: "complete"; evidenceRefs: string[]; fingerprint: string; }
const surfaces = ["characterChoices", "causality", "outline", "proseCandidates", "knowledge", "obligations", "readerExperience", "ending"] as const;
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createWorldImpactReport(input: Omit<WorldImpactReport, "schemaVersion" | "status" | "fingerprint">): WorldImpactReport {
  if (!input.reportId.trim() || !input.changedId.trim() || !input.changedSummary.trim()) throw new Error("WORLD_IMPACT_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WORLD_IMPACT_EVIDENCE_REQUIRED");
  if (!input.protectedUnrelatedCanon.length) throw new Error("WORLD_IMPACT_PROTECTION_REQUIRED");
  if (surfaces.some((surface) => !input.affected[surface]?.length)) throw new Error("WORLD_IMPACT_SURFACE_MISSING");
  const base = { schemaVersion: "world-impact-report.v1" as const, ...input, affected: Object.fromEntries(surfaces.map((surface) => [surface, [...input.affected[surface]]])) as WorldImpactReport["affected"], protectedUnrelatedCanon: [...input.protectedUnrelatedCanon], evidenceRefs: [...input.evidenceRefs], status: "complete" as const };
  return { ...base, fingerprint: hash(base) };
}
