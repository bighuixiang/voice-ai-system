import crypto from "node:crypto";

export type ContextAuthority = "canon" | "chapter" | "summary" | "imported" | "model";
export interface ContextSource { blockId: string; factKey: string; sourceRef: string; sourceVersion: string; contentHash: string; authority: ContextAuthority; relevance: number; selected: boolean; selectionReason: string; }
export interface ContextSourceResult { schemaVersion: "context-source-gate.v1"; purpose: string; query: string; status: "pass" | "block"; selectedBlockIds: string[]; excluded: Array<{ blockId: string; reason: string }>; conflicts: Array<{ factKey: string; blockIds: string[] }>; fingerprint: string; }

const authorityRank: Record<ContextAuthority, number> = { model: 1, imported: 2, summary: 3, chapter: 4, canon: 5 };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonSensitivePurpose = (purpose: string): boolean => /canon|publication|settlement|continuity|generation/i.test(purpose);

export function evaluateContextSources(input: { purpose: string; query: string; sources: ContextSource[] }): ContextSourceResult {
  if (!input.purpose.trim() || !input.query.trim()) throw new Error("CONTEXT_PURPOSE_QUERY_REQUIRED");
  if (input.sources.some((source) => !source.blockId.trim() || !source.factKey.trim() || !source.sourceRef.trim() || !source.sourceVersion.trim() || !source.contentHash.trim() || !source.selectionReason.trim() || !Number.isFinite(source.relevance) || source.relevance < 0 || source.relevance > 1)) throw new Error("CONTEXT_SOURCE_FIELDS_INVALID");
  const excluded: ContextSourceResult["excluded"] = input.sources.filter((source) => !source.selected).map((source) => ({ blockId: source.blockId, reason: source.selectionReason.trim() || "EXCLUDED_WITHOUT_REASON" }));
  const selected = input.sources.filter((source) => source.selected).filter((source) => {
    if (canonSensitivePurpose(input.purpose) && (source.authority === "summary" || /^(summary|ledger):\/\//i.test(source.sourceRef))) {
      excluded.push({ blockId: source.blockId, reason: "LEGACY_PROJECTION_NOT_CANON_AUTHORITY" });
      return false;
    }
    if (canonSensitivePurpose(input.purpose) && (source.authority === "model" || source.authority === "imported")) {
      excluded.push({ blockId: source.blockId, reason: "UNTRUSTED_AUTHORITY_NOT_CANON" });
      return false;
    }
    return true;
  });
  const selectedBlockIds: string[] = [];
  const conflicts: ContextSourceResult["conflicts"] = [];
  const groups = new Map<string, ContextSource[]>();
  for (const source of selected) groups.set(source.factKey, [...(groups.get(source.factKey) || []), source]);
  for (const [factKey, group] of groups) {
    const hashes = new Set(group.map((source) => source.contentHash));
    if (hashes.size > 1) {
      conflicts.push({ factKey, blockIds: group.map((source) => source.blockId) });
      selectedBlockIds.push(...group.map((source) => source.blockId));
      continue;
    }
    const winner = [...group].sort((a, b) => authorityRank[b.authority] - authorityRank[a.authority] || b.relevance - a.relevance)[0];
    selectedBlockIds.push(winner.blockId);
    for (const source of group.filter((candidate) => candidate.blockId !== winner.blockId)) excluded.push({ blockId: source.blockId, reason: "DUPLICATE_LOWER_AUTHORITY" });
  }
  const base = { schemaVersion: "context-source-gate.v1" as const, purpose: input.purpose, query: input.query, status: conflicts.length || excluded.some((item) => ["LEGACY_PROJECTION_NOT_CANON_AUTHORITY", "UNTRUSTED_AUTHORITY_NOT_CANON"].includes(item.reason)) ? "block" as const : "pass" as const, selectedBlockIds, excluded, conflicts };
  return { ...base, fingerprint: hash(base) };
}
