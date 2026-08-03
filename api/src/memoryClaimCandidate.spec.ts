import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildMemoryClaimCandidates, persistMemoryClaimCandidates } from "./memoryClaimCandidate.js";
const patch = (newFacts: unknown[]) => ({ patchId: "patch-candidate-1", chapterId: "chapter-001", chapterVersion: "chapter-001:v1", sourceRefs: ["chapter-settlement://chapter-001"], newFacts, status: "candidate" as const });
describe("post-generation memory claim isolation", () => {
  it("turns new facts into sourced candidates, never canon", () => { const [candidate] = buildMemoryClaimCandidates({ projectSlug: "demo", patch: patch([{ fact: "The bell carries voices" }]) }); expect(candidate).toMatchObject({ status: "candidate", epistemicType: "canon_fact", producedBy: "system-inference" }); expect(candidate.sourceRefs).toContain("memory-patch://patch-candidate-1"); expect(candidate.evidenceAnchors[0]).toContain("newFacts/0"); });
  it("rejects a new-fact entry without a proposition instead of dropping it", () => { expect(() => buildMemoryClaimCandidates({ projectSlug: "demo", patch: patch([{ unsupported: true }]) })).toThrow("MEMORY_CANDIDATE_FACT_INVALID"); });
  it("persists candidates idempotently without duplicating claim events", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-candidates-")); const input = { projectSlug: "demo", patch: patch(["The bell carries voices"]) }; const first = await persistMemoryClaimCandidates(root, input); const second = await persistMemoryClaimCandidates(root, input); expect(second).toEqual(first); expect((await fs.readFile(path.join(root, "memory", "claims", "events.jsonl"), "utf8")).trim().split(/\r?\n/)).toHaveLength(1); });
});
