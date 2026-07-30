import crypto from "node:crypto";

export interface PowerComparison {
  schemaVersion: "power-comparison.v1";
  comparisonId: string;
  subjectA: string;
  subjectB: string;
  dimensions: string[];
  environment: string;
  preparation: string;
  information: string;
  resources: string;
  counters: string;
  confidence: { min: number; max: number };
  verdict: "subjectA-favored" | "subjectB-favored" | "unknown";
  rationale: string;
  strategyChoice?: string;
  strategyEvidenceRefs?: string[];
  strategyCost?: string;
  evidenceRefs: string[];
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function comparePowerInContext(input: Omit<PowerComparison, "schemaVersion" | "verdict" | "fingerprint"> & { advantage: "subjectA" | "subjectB" | "unknown" }): PowerComparison {
  if (!input.comparisonId.trim() || !input.subjectA.trim() || !input.subjectB.trim() || !input.rationale.trim()) throw new Error("POWER_COMPARISON_FIELDS_REQUIRED");
  if (input.advantage !== "unknown" && (!input.dimensions.length || !input.environment.trim() || !input.preparation.trim() || !input.information.trim() || !input.resources.trim() || !input.counters.trim())) throw new Error("POWER_CONTEXT_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("POWER_COMPARISON_EVIDENCE_REQUIRED");
  if (input.confidence.min < 0 || input.confidence.max > 1 || input.confidence.min > input.confidence.max) throw new Error("POWER_CONFIDENCE_INVALID");
  const strategy = Boolean(input.strategyChoice?.trim() || input.strategyEvidenceRefs?.length || input.strategyCost?.trim());
  if (input.advantage !== "unknown" && strategy && (!input.strategyChoice?.trim() || !input.strategyEvidenceRefs?.length || !input.strategyCost?.trim())) throw new Error("POWER_STRATEGY_EVIDENCE_REQUIRED");
  if (input.advantage !== "unknown" && !strategy && input.rationale.toLowerCase().includes("strategy")) throw new Error("POWER_STRATEGY_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "power-comparison.v1" as const, comparisonId: input.comparisonId, subjectA: input.subjectA, subjectB: input.subjectB, dimensions: [...input.dimensions], environment: input.environment, preparation: input.preparation, information: input.information, resources: input.resources, counters: input.counters, confidence: { ...input.confidence }, verdict: input.advantage === "subjectA" ? "subjectA-favored" as const : input.advantage === "subjectB" ? "subjectB-favored" as const : "unknown" as const, rationale: input.rationale, ...(input.strategyChoice ? { strategyChoice: input.strategyChoice } : {}), ...(input.strategyEvidenceRefs ? { strategyEvidenceRefs: [...input.strategyEvidenceRefs] } : {}), ...(input.strategyCost ? { strategyCost: input.strategyCost } : {}), evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
