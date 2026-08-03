import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildMemoryRetconImpactReport } from "./memoryRetconImpact.js";

describe("memory retcon impact report", () => {
  it("reports downstream projections that must be invalidated or rebuilt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-retcon-impact-"));
    await fs.mkdir(path.join(root, "knowledge"), { recursive: true });
    await fs.mkdir(path.join(root, "story-graph"), { recursive: true });
    await fs.mkdir(path.join(root, "runtime", "snapshots"), { recursive: true });
    await fs.mkdir(path.join(root, "publication"), { recursive: true });
    await fs.writeFile(path.join(root, "knowledge", "facts.jsonl"), '{"id":"memory-claim:claim-impact"}\n', "utf8");
    await fs.writeFile(path.join(root, "story-graph", "storyline.json"), '{"memoryClaimIds":["claim-impact"]}\n', "utf8");
    const report = await buildMemoryRetconImpactReport(root, { claimId: "claim-impact", replacementClaimVersion: 3, reason: "new canon evidence" });
    expect(report.status).toBe("blocked-until-rebuild");
    expect(report.actions).toEqual(expect.arrayContaining(["REBUILD_KNOWLEDGE_INDEX", "REBUILD_STORY_GRAPH", "INVALIDATE_RUNTIME_SNAPSHOTS", "REVALIDATE_PUBLICATION_DERIVATIVES"]));
    expect(report.affectedPaths).toEqual(expect.arrayContaining(["knowledge/facts.jsonl", "story-graph/storyline.json"]));
    expect(report.affectedScopes).toMatchObject({ prose: expect.any(Array), summaries: expect.any(Array), characterKnowledge: expect.any(Array), readerKnowledge: expect.any(Array), obligations: expect.any(Array), outlines: expect.any(Array), candidates: expect.any(Array), publications: expect.any(Array) });
    expect(report.affectedScopes.prose).toContain("story-graph/storyline.json");
  });
});
