import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectFiles, createProjectSkeleton, projectRoot } from "./novelProject.js";
import { createMemoryClaim, persistMemoryClaim, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";
import { buildMemoryRetconImpactReport } from "./memoryRetconImpact.js";
import { executeMemoryRetconRebuild } from "./memoryRetconRebuild.js";

describe("memory retcon rebuild", () => {
  it("rebuilds projections and records immutable invalidation manifests", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "memory-retcon-rebuild-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({ title: "Retcon Rebuild", roughIdea: "Rebuild downstream assets." });
    await createProjectFiles(project);
    const root = projectRoot(project.slug);
    const settled = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "claim-rebuild", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const retcon = retconMemoryClaim({ claim: settled, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(root, settled, "settled", "original");
    await persistMemoryClaim(root, retcon.obsolete, "obsoleted", "retcon");
    await persistMemoryClaim(root, retcon.replacement, "created", "replacement");
    const report = await buildMemoryRetconImpactReport(root, { claimId: retcon.replacement.claimId, replacementClaimVersion: retcon.replacement.version, reason: "retcon" });
    const result = await executeMemoryRetconRebuild(root, project, report);
    expect(result.status).toBe("executed");
    expect(result.executedActions).toEqual(expect.arrayContaining(["REBUILD_KNOWLEDGE_INDEX", "REBUILD_STORY_GRAPH", "INVALIDATE_RUNTIME_SNAPSHOTS", "REVALIDATE_PUBLICATION_DERIVATIVES"]));
    await expect(fs.readFile(path.join(root, "memory", "retcon-invalidations.jsonl"), "utf8")).resolves.toContain("claim-rebuild");
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
  });
});
