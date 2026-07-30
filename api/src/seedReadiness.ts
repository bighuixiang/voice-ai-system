import crypto from "node:crypto";

export interface SafeSeedExploration { schemaVersion: "safe-seed-exploration.v1"; appliesToInterpretations: string[]; scope: string; invalidationConditions: string[]; status: "candidate"; isCanon: false; fingerprint: string; }
export interface StoryContractReadiness { schemaVersion: "story-contract-readiness.v1"; target: string; ready: boolean; required: string[]; missing: string[]; unknown: string[]; fingerprint: string; }
export interface SeedConfidence { schemaVersion: "seed-confidence.v1"; coverage: number; evidenceStrength: number; conflicts: string[]; unknown: string[]; fingerprint: string; }
export interface ReversibleDefault { schemaVersion: "reversible-default.v1"; field: string; value: string; source: string; reversible: true; revocable: true; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createSafeSeedExploration(input: { interpretationIds: readonly string[]; scope: string; invalidationConditions: readonly string[] }): SafeSeedExploration {
  if (input.interpretationIds.length < 2 || !input.scope.trim() || !input.invalidationConditions.length) throw new Error("SAFE_EXPLORATION_FIELDS_REQUIRED");
  const base = { schemaVersion: "safe-seed-exploration.v1" as const, appliesToInterpretations: [...input.interpretationIds], scope: input.scope, invalidationConditions: [...input.invalidationConditions], status: "candidate" as const, isCanon: false as const };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateStoryContractReadiness(input: { target: string; facets: Record<string, string> }): StoryContractReadiness {
  if (!input.target.trim()) throw new Error("READINESS_TARGET_REQUIRED");
  const required = ["protagonist", "desire", "resistance", "stakes", "experience"];
  const missing = required.filter((name) => !input.facets[name]?.trim() || input.facets[name].toLowerCase() === "unknown");
  const unknown = Object.entries(input.facets).filter(([, value]) => !value.trim() || value.toLowerCase() === "unknown").map(([name]) => name);
  const base = { schemaVersion: "story-contract-readiness.v1" as const, target: input.target, ready: missing.length === 0, required, missing, unknown };
  return { ...base, fingerprint: hash(base) };
}

export function assessSeedConfidence(input: { facets: readonly Array<{ name: string; value: string; evidenceStrength: number }>; conflicts: readonly string[] }): SeedConfidence {
  if (!input.facets.length) throw new Error("SEED_FACETS_REQUIRED");
  const unknown = input.facets.filter((facet) => !facet.value.trim() || facet.value.toLowerCase() === "unknown").map((facet) => facet.name);
  const base = { schemaVersion: "seed-confidence.v1" as const, coverage: Number(((input.facets.length - unknown.length) / input.facets.length).toFixed(4)), evidenceStrength: Number((input.facets.reduce((sum, facet) => sum + Math.max(0, Math.min(1, facet.evidenceStrength)), 0) / input.facets.length).toFixed(4)), conflicts: [...input.conflicts], unknown };
  return { ...base, fingerprint: hash(base) };
}

export function applyReversibleDefault(input: { field: string; value: string; source: string }): ReversibleDefault {
  const forbidden = new Set(["coreIdentity", "valueStance", "majorRelationship", "endingTruth", "copyrightBoundary"]);
  if (!input.field.trim() || !input.value.trim() || !input.source.trim()) throw new Error("DEFAULT_FIELDS_REQUIRED");
  if (forbidden.has(input.field)) throw new Error("IRREVERSIBLE_DEFAULT_FORBIDDEN");
  const base = { schemaVersion: "reversible-default.v1" as const, field: input.field, value: input.value, source: input.source, reversible: true as const, revocable: true as const };
  return { ...base, fingerprint: hash(base) };
}
