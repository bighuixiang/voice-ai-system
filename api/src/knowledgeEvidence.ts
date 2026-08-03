import type { KnowledgeFact, KnowledgeTriple } from "./types.js";

export type KnowledgeEvidenceQuality = "canon" | "derived" | "plan" | "unknown";

export interface KnowledgeEvidenceSource {
  id: string;
  family: string;
  independent: boolean;
  quality: KnowledgeEvidenceQuality;
  derivedFromIds: string[];
}

export interface KnowledgeEvidenceProfile {
  sources: KnowledgeEvidenceSource[];
  independentSourceCount: number;
  familyCount: number;
  duplicateDerivedGroupCount: number;
  gaps: string[];
  saysNoContradiction: boolean;
}

export function evidenceQualityPriority(quality: KnowledgeEvidenceQuality): number {
  return quality === "canon" ? 4 : quality === "derived" ? 3 : quality === "plan" ? 2 : 1;
}

function sourceFamily(fact: KnowledgeFact): string {
  if (fact.source.type === "chapter-summary") return `chapter-summary:${fact.chapterIds[0] || fact.source.id}`;
  return `${fact.source.type}:${fact.source.id}`;
}

function sourceQuality(fact: KnowledgeFact, canonicalSourceIds: Set<string>): KnowledgeEvidenceQuality {
  if (canonicalSourceIds.has(fact.source.id)) return "canon";
  if (fact.source.type === "story-control") return "plan";
  if (fact.source.type === "chapter-summary" || fact.source.type === "ledger") return "derived";
  return "unknown";
}

function gapForReason(reason: string): string | undefined {
  const upper = reason.toUpperCase();
  if (upper.includes("PERMISSION") || upper.includes("VISIBILITY") || upper.includes("KNOWLEDGE_REQUIRED") || upper.includes("SECRET_BOUNDARY")) return "permission-blocked";
  if (upper.includes("EXTRACT")) return "extraction-failed";
  if (upper.includes("CONTRADICTION") || upper.includes("CONFLICT")) return "conflict";
  if (upper.includes("UNORDERED") || upper.includes("UNKNOWN")) return "time-unknown";
  return undefined;
}

export function buildKnowledgeEvidenceProfile(input: {
  facts: readonly KnowledgeFact[];
  triples: readonly KnowledgeTriple[];
  selectedIds: readonly string[];
  excluded?: readonly { id: string; reason: string }[];
  canonicalSourceIds: readonly string[];
}): KnowledgeEvidenceProfile {
  const selected = new Set(input.selectedIds);
  const canonicalSourceIds = new Set(input.canonicalSourceIds);
  const sourceMap = new Map<string, KnowledgeEvidenceSource>();
  const add = (fact: KnowledgeFact, derivedFromId: string) => {
    const id = fact.source.id;
    const current = sourceMap.get(id);
    if (current) {
      current.derivedFromIds = Array.from(new Set([...current.derivedFromIds, derivedFromId])).sort();
      return;
    }
    sourceMap.set(id, {
      id,
      family: sourceFamily(fact),
      independent: true,
      quality: sourceQuality(fact, canonicalSourceIds),
      derivedFromIds: [derivedFromId]
    });
  };

  for (const fact of input.facts) {
    if (selected.has(fact.id)) add(fact, fact.id);
  }
  const factById = new Map(input.facts.map((fact) => [fact.id, fact]));
  for (const triple of input.triples) {
    if (!selected.has(triple.id)) continue;
    for (const factId of triple.sourceFactIds) {
      const fact = factById.get(factId);
      if (fact) add(fact, triple.id);
    }
  }

  const families = new Map<string, KnowledgeEvidenceSource[]>();
  for (const source of sourceMap.values()) families.set(source.family, [...(families.get(source.family) || []), source]);
  for (const familySources of families.values()) {
    familySources.forEach((source, index) => { source.independent = index === 0; });
  }

  const gaps = new Set<string>();
  if (!sourceMap.size) gaps.add("not-found");
  for (const excluded of input.excluded || []) {
    const gap = gapForReason(excluded.reason);
    if (gap) gaps.add(gap);
  }
  const hasConflict = gaps.has("conflict");
  return {
    sources: [...sourceMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    independentSourceCount: [...sourceMap.values()].filter((source) => source.independent).length,
    familyCount: families.size,
    duplicateDerivedGroupCount: [...sourceMap.values()].filter((source) => source.derivedFromIds.length > 1).length,
    gaps: [...gaps].sort(),
    saysNoContradiction: Boolean(sourceMap.size) && !hasConflict
  };
}
