import crypto from "node:crypto";

export interface RetrievalEligibility {
  schemaVersion: "retrieval-eligibility.v1";
  status: "pass" | "warn";
  selectedIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function buildRetrievalEligibility(blocks: Array<{ title: string; content: string }>): RetrievalEligibility {
  const selectedIds: string[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  for (const block of blocks) {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(block.content) as Record<string, unknown>; } catch { continue; }
    if (parsed.projectionType !== "knowledge-index") continue;
    for (const groupKey of ["facts", "triples", "relatedFacts", "relatedTriples"]) {
      const group = Array.isArray(parsed[groupKey]) ? parsed[groupKey] : [];
      for (const item of group) {
        if (item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string") selectedIds.push(String((item as Record<string, unknown>).id));
      }
    }
    const rawExcluded = Array.isArray(parsed.excluded) ? parsed.excluded : [];
    for (const item of rawExcluded) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id === "string" && typeof candidate.reason === "string") excluded.push({ id: candidate.id, reason: candidate.reason });
    }
  }
  const base = { schemaVersion: "retrieval-eligibility.v1" as const, status: excluded.length ? "warn" as const : "pass" as const, selectedIds: [...new Set(selectedIds)], excluded };
  return { ...base, fingerprint: hash(base) };
}
