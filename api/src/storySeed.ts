import crypto from "node:crypto";

export type SeedFacetName = "protagonist" | "situation" | "desire" | "resistance" | "stakes" | "worldSignal" | "relationship" | "themeQuestion" | "experience" | "prohibition" | "creativeCommand" | "trauma";
export interface AuthorUtterance { schemaVersion: "author-utterance.v1"; utteranceId: string; projectId: string; text: string; idempotencyKey: string; status: "captured"; fingerprint: string; }
export interface EvidenceSpan { start: number; end: number; }
export interface SeedFacet { facet: SeedFacetName; value: string; certainty: "explicit" | "unknown"; evidence: EvidenceSpan[]; }
export interface StorySeedFrame { schemaVersion: "story-seed-frame.v1"; utterance: AuthorUtterance; facets: SeedFacet[]; fingerprint: string; }
export interface SeedInterpretationSet { schemaVersion: "seed-interpretation-set.v1"; frameFingerprint: string; commonFacets: SeedFacetName[]; interpretations: Array<{ interpretationId: string; differences: string[]; downstreamImpact: string[]; supports: string[]; contradictions: string[] }>; status: "unresolved" | "resolved"; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const makeId = (projectId: string, key: string) => `utterance-${hash({ projectId, key }).slice(0, 16)}`;

export function captureAuthorUtterance(input: { projectId: string; text: string; idempotencyKey: string }): AuthorUtterance {
  if (!input.projectId.trim() || !input.text.trim() || !input.idempotencyKey.trim()) throw new Error("AUTHOR_UTTERANCE_FIELDS_REQUIRED");
  const base = { schemaVersion: "author-utterance.v1" as const, utteranceId: makeId(input.projectId, input.idempotencyKey), projectId: input.projectId, text: input.text, idempotencyKey: input.idempotencyKey, status: "captured" as const };
  return { ...base, fingerprint: hash(base) };
}

export function buildStorySeedFrame(input: { utterance: AuthorUtterance; facets: readonly Array<{ facet: SeedFacetName; value: string; evidence: readonly EvidenceSpan[] }> }): StorySeedFrame {
  for (const item of input.facets) {
    const value = item.value.trim();
    if (!value) throw new Error("SEED_FACET_VALUE_REQUIRED");
    const unknown = value.toLowerCase() === "unknown";
    if (!unknown && !item.evidence.length) throw new Error("SEED_EVIDENCE_REQUIRED");
    for (const span of item.evidence) if (span.start < 0 || span.end <= span.start || span.end > input.utterance.text.length) throw new Error("SEED_EVIDENCE_RANGE_INVALID");
  }
  const base = { schemaVersion: "story-seed-frame.v1" as const, utterance: { ...input.utterance }, facets: input.facets.map((item) => ({ facet: item.facet, value: item.value, certainty: item.value.toLowerCase() === "unknown" ? "unknown" as const : "explicit" as const, evidence: item.evidence.map((span) => ({ ...span })) })) };
  return { ...base, fingerprint: hash(base) };
}

export function createSeedInterpretationSet(input: { frame: StorySeedFrame; interpretations: readonly SeedInterpretationSet["interpretations"] }): SeedInterpretationSet {
  if (input.interpretations.length < 2) throw new Error("SEED_INTERPRETATIONS_REQUIRED");
  for (const interpretation of input.interpretations) if (!interpretation.interpretationId.trim() || !interpretation.differences.length || !interpretation.downstreamImpact.length) throw new Error("SEED_INTERPRETATION_INVALID");
  const commonFacets = input.frame.facets.filter((facet) => input.interpretations.every((interpretation) => interpretation.supports.includes(facet.facet) || facet.certainty === "explicit")).map((facet) => facet.facet);
  const base = { schemaVersion: "seed-interpretation-set.v1" as const, frameFingerprint: input.frame.fingerprint, commonFacets: [...new Set(commonFacets)], interpretations: input.interpretations.map((interpretation) => ({ ...interpretation, differences: [...interpretation.differences], downstreamImpact: [...interpretation.downstreamImpact], supports: [...interpretation.supports], contradictions: [...interpretation.contradictions] })), status: "unresolved" as const };
  return { ...base, fingerprint: hash(base) };
}
