import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryClaim, persistMemoryClaim, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";
import { assertMemoryProjectionCanGenerate, evaluateMemoryProjectionFreshness } from "./memoryProjectionGate.js";
import { applyMemoryProjectionGate } from "./runtimeEngine.js";

describe("memory projection freshness gate", () => {
  it("blocks canon-dependent generation while a retcon replacement is pending", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-projection-gate-"));
    const settled = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "claim-gate", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const retcon = retconMemoryClaim({ claim: settled, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(root, settled, "settled", "original");
    await persistMemoryClaim(root, retcon.obsolete, "obsoleted", "retcon");
    await persistMemoryClaim(root, retcon.replacement, "created", "replacement candidate");
    expect(await evaluateMemoryProjectionFreshness(root)).toMatchObject({ status: "replacement-pending", blockingReasons: ["MEMORY_REPLACEMENT_PENDING"] });
  });

  it("adds the freshness block to the runtime snapshot", () => {
    const snapshot = { blockingReasons: [], qualityRisks: [], summarySignals: [], knowledgeSignals: {}, contextBlocks: [] } as never;
    const gated = applyMemoryProjectionGate(snapshot, { status: "stale", blockingReasons: ["MEMORY_PROJECTION_STALE"], affectedClaimIds: ["claim-gate"] });
    expect(gated.memoryProjection).toMatchObject({ status: "stale", affectedClaimIds: ["claim-gate"] });
    expect(gated.blockingReasons).toContain("MEMORY_PROJECTION_STALE");
  });

  it("rejects canon generation when freshness is stale or replacement-pending", () => {
    expect(() => assertMemoryProjectionCanGenerate({ status: "replacement-pending", blockingReasons: ["MEMORY_REPLACEMENT_PENDING"], affectedClaimIds: ["claim-gate"] })).toThrow("MEMORY_REPLACEMENT_PENDING");
    expect(() => assertMemoryProjectionCanGenerate({ status: "stale", blockingReasons: ["MEMORY_PROJECTION_STALE"], affectedClaimIds: ["claim-gate"] })).toThrow("MEMORY_PROJECTION_STALE");
    expect(() => assertMemoryProjectionCanGenerate({ status: "current", blockingReasons: [], affectedClaimIds: [] })).not.toThrow();
  });

  it("fails closed when a persisted claim event is corrupted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-projection-corrupt-event-"));
    await fs.mkdir(path.join(root, "memory", "claims"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "claims", "events.jsonl"), '{"claimId":"claim-1","eventType":"obsoleted"}\n', "utf8");

    await expect(evaluateMemoryProjectionFreshness(root)).rejects.toThrow("MEMORY_CLAIM_EVENT_INTEGRITY_FAILED");
  });

  it("marks an eligible claim stale when a file-backed evidence source is deleted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-projection-source-missing-"));
    await fs.mkdir(path.join(root, "evidence"), { recursive: true });
    await fs.writeFile(path.join(root, "evidence", "source.md"), "the gate is open", "utf8");
    const claim = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "claim-source", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["file://evidence/source.md"], evidenceAnchors: ["file://evidence/source.md#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    await persistMemoryClaim(root, claim, "settled", "original");
    await fs.rm(path.join(root, "evidence", "source.md"));

    await expect(evaluateMemoryProjectionFreshness(root)).resolves.toMatchObject({ status: "stale", blockingReasons: ["MEMORY_CLAIM_SOURCE_MISSING"], affectedClaimIds: ["claim-source"] });
  });
});
