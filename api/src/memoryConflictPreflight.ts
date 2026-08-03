import { buildMemoryContradictionSets, type MemoryClaim, type MemoryClaimRelation } from "./memoryClaim.js";
import type { MemoryProjectionFreshness } from "./memoryProjectionGate.js";

export interface MemoryConflictPreflight {
  status: "ready" | "blocked";
  contradictionSetIds: string[];
  freshness: MemoryProjectionFreshness;
  blockers: string[];
  authority: "persisted-memory-claims-and-relations";
}

export function buildMemoryConflictPreflight(input: { claims: readonly MemoryClaim[]; relations: readonly MemoryClaimRelation[]; freshness: MemoryProjectionFreshness }): MemoryConflictPreflight {
  const contradictionSetIds = buildMemoryContradictionSets([...input.claims], [...input.relations]).map((set) => set.setId);
  const blockers = [contradictionSetIds.length ? "MEMORY_CONTRADICTION_UNRESOLVED" : "", ...input.freshness.blockingReasons].filter(Boolean);
  return { status: blockers.length ? "blocked" : "ready", contradictionSetIds, freshness: input.freshness, blockers, authority: "persisted-memory-claims-and-relations" };
}
