import crypto from "node:crypto";
import type { ChapterMemoryPatch } from "./chapterMemoryPatch.js";
import { createMemoryClaim, listMemoryClaims, persistMemoryClaim, type MemoryClaim } from "./memoryClaim.js";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function propositionFromFact(fact: unknown): string {
  if (typeof fact === "string") return fact.trim();
  if (!fact || typeof fact !== "object") return "";
  const value = fact as Record<string, unknown>;
  for (const key of ["proposition", "fact", "value", "text"]) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  return "";
}
export function buildMemoryClaimCandidates(input: { projectSlug: string; patch: Pick<ChapterMemoryPatch, "patchId" | "chapterId" | "chapterVersion" | "sourceRefs" | "newFacts" | "status"> }): MemoryClaim[] {
  if (!input.projectSlug.trim() || !input.patch.patchId.trim() || input.patch.status !== "candidate") throw new Error("MEMORY_CANDIDATE_PATCH_REQUIRED");
  return input.patch.newFacts.map((fact, index) => {
    const proposition = propositionFromFact(fact);
    if (!proposition) throw new Error("MEMORY_CANDIDATE_FACT_INVALID");
    const evidenceRef = `memory-patch://${input.patch.patchId}#newFacts/${index}`;
    return createMemoryClaim({ claimId: `memory-candidate-${hash({ projectSlug: input.projectSlug, patchId: input.patch.patchId, index, proposition }).slice(0, 24)}`, proposition, epistemicType: "canon_fact", sourceRefs: [...new Set([...input.patch.sourceRefs, `memory-patch://${input.patch.patchId}`])], evidenceAnchors: [evidenceRef], producedBy: "system-inference", temporalScope: { asOfVersion: input.patch.chapterVersion, startEvent: input.patch.chapterId }, confidence: 0.5 });
  });
}
export async function persistMemoryClaimCandidates(root: string, input: { projectSlug: string; patch: Pick<ChapterMemoryPatch, "patchId" | "chapterId" | "chapterVersion" | "sourceRefs" | "newFacts" | "status"> }): Promise<MemoryClaim[]> {
  const candidates = buildMemoryClaimCandidates(input);
  const existing = await listMemoryClaims(root);
  const byId = new Map(existing.map((claim) => [claim.claimId, claim]));
  for (const candidate of candidates) {
    const match = byId.get(candidate.claimId);
    if (match) { if (match.fingerprint !== candidate.fingerprint) throw new Error("MEMORY_CANDIDATE_CONFLICT"); continue; }
    await persistMemoryClaim(root, candidate, "created", `candidate from memory patch ${input.patch.patchId}`);
  }
  return candidates;
}
