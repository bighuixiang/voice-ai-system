import crypto from "node:crypto";
import type { ResearchSourceSnapshot } from "./researchGrounding.js";

export interface ResearchSourceReliabilityAssessment {
  schemaVersion: "research-source-reliability.v1";
  sourceId: string;
  status: "eligible" | "insufficient";
  reasons: string[];
  requiredSignals: string[];
  independentSourceCount: number;
  independentSourceIds: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateResearchSourceReliability(input: {
  source: ResearchSourceSnapshot;
  corroboratingSources: ResearchSourceSnapshot[];
  requiredSignals: string[];
  minIndependentSources: number;
}): ResearchSourceReliabilityAssessment {
  if (!Number.isInteger(input.minIndependentSources) || input.minIndependentSources < 0) throw new Error("RESEARCH_RELIABILITY_THRESHOLD_INVALID");
  const requiredSignals = [...new Set(input.requiredSignals.map((signal) => signal.trim()).filter(Boolean))].sort();
  const reasons: string[] = [];
  if (requiredSignals.some((signal) => !input.source.reliabilitySignals.includes(signal))) reasons.push("REQUIRED_RELIABILITY_SIGNAL_MISSING");
  const independent = input.corroboratingSources
    .filter((candidate) => candidate.sourceId !== input.source.sourceId && candidate.contentHash !== input.source.contentHash)
    .filter((candidate, index, all) => all.findIndex((item) => item.sourceId === candidate.sourceId) === index)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (independent.length < input.minIndependentSources) reasons.push("INDEPENDENT_CORROBORATION_INSUFFICIENT");
  const base = {
    schemaVersion: "research-source-reliability.v1" as const,
    sourceId: input.source.sourceId,
    status: reasons.length ? "insufficient" as const : "eligible" as const,
    reasons,
    requiredSignals,
    independentSourceCount: independent.length,
    independentSourceIds: independent.map((candidate) => candidate.sourceId)
  };
  return { ...base, fingerprint: hash(base) };
}
