import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCraftPattern, approveCraftPattern } from "./craftPattern.js";
import { createRightsEnvelope, createSourceMaterial } from "./sourceRights.js";
import { assertPatternTransferPlanIntegrity, assertSimilarityGuardIntegrity, createPatternTransferPlan, evaluateSimilarityGuard, readPatternTransferPlan } from "./patternTransfer.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pattern-transfer-"));
  const source = await createSourceMaterial({ root, projectSlug: "demo", title: "Owned notes", type: "notes", provenance: "author-upload", rightsStatus: "owned", licensor: "author", allowedUses: ["analysis", "style-experiment"], projectScope: "demo", retainExcerpt: false, importedBy: "author" });
  const envelope = await createRightsEnvelope({ root, source, checkedBy: "author" });
  const pattern = await createCraftPattern({ root, projectSlug: "demo", name: "Compact turns", mechanism: "compress repeated exposition", narrativeFunction: "raise pressure", applicability: ["conflict"], counterexamples: ["reconciliation"], sourceEnvelopeIds: [envelope.envelopeId], evidenceRefs: ["source://notes#1"] });
  const approved = await approveCraftPattern({ root, patternId: pattern.patternId, actor: "author", reason: "Project-scoped" });
  return { root, approved, envelope };
}

describe("pattern transfer and similarity guard", () => {
  it("passes materially transformed text and blocks near-copy text", () => {
    const pass = evaluateSimilarityGuard({ sourceText: "The guard opened the gate and the bells rang twice.", targetText: "At dusk, the watchman unlatched the iron door; two distant chimes answered.", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v1" });
    expect(pass.status).toBe("passed");
    expect(pass.semanticRisk).toBe("low");
    expect(pass.structuralRisk).toBe("low");
    const blocked = evaluateSimilarityGuard({ sourceText: "The guard opened the gate and the bells rang twice.", targetText: "The guard opened the gate and the bells rang twice.", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v2" });
    expect(blocked.status).toBe("blocked");
    expect(blocked.risk).toBe("high");
    expect(blocked.structuralRisk).toBe("high");
  });

  it("requires approved pattern, valid rights, and passed guard", async () => {
    const { root, approved, envelope } = await fixture();
    const guard = evaluateSimilarityGuard({ sourceText: "A repeated explanation.", targetText: "A tense exchange with a new choice.", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v1" });
    const plan = await createPatternTransferPlan({ root, projectSlug: "demo", pattern: approved, sourceEnvelopeId: envelope.envelopeId, guard, targetChapterId: "chapter-1", intendedEffect: "compress exposition while preserving pressure" });
    expect(plan.status).toBe("candidate");
    expect(plan.canonWriteAllowed).toBe(false);
    expect(await readPatternTransferPlan(root, plan.planId)).toEqual(plan);
  });

  it("blocks transfer when similarity guard fails or pattern is not approved", async () => {
    const { root, approved, envelope } = await fixture();
    const blocked = evaluateSimilarityGuard({ sourceText: "same wording repeated", targetText: "same wording repeated", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v2" });
    await expect(createPatternTransferPlan({ root, projectSlug: "demo", pattern: approved, sourceEnvelopeId: envelope.envelopeId, guard: blocked, targetChapterId: "chapter-1", intendedEffect: "copy" })).rejects.toThrow("PATTERN_TRANSFER_SIMILARITY_BLOCKED");
    await expect(createPatternTransferPlan({ root, projectSlug: "demo", pattern: { ...approved, lifecycle: "candidate" }, sourceEnvelopeId: envelope.envelopeId, guard: evaluateSimilarityGuard({ sourceText: "a", targetText: "b", maxTokenOverlap: 0.35, sourceVersion: "s", targetVersion: "t" }), targetChapterId: "chapter-1", intendedEffect: "test" })).rejects.toThrow("PATTERN_TRANSFER_APPROVAL_REQUIRED");
  });
  it("requires real pre/post text and detects guard tampering", () => { expect(() => evaluateSimilarityGuard({ sourceText: " ", targetText: "draft", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v1" })).toThrow("SIMILARITY_GUARD_INPUT_INVALID"); const guard = evaluateSimilarityGuard({ sourceText: "source text", targetText: "new draft", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v1" }); expect(() => assertSimilarityGuardIntegrity({ ...guard, status: "blocked" })).toThrow("SIMILARITY_GUARD_INTEGRITY_FAILED"); });
  it("fails closed when a transfer plan or nested guard is tampered", async () => { const { root, approved, envelope } = await fixture(); const guard = evaluateSimilarityGuard({ sourceText: "source text", targetText: "new draft", maxTokenOverlap: 0.35, sourceVersion: "source-v1", targetVersion: "draft-v1" }); const plan = await createPatternTransferPlan({ root, projectSlug: "demo", pattern: approved, sourceEnvelopeId: envelope.envelopeId, guard, targetChapterId: "chapter-tamper", intendedEffect: "preserve pressure" }); expect(() => assertPatternTransferPlanIntegrity({ ...plan, canonWriteAllowed: true as false })).toThrow("PATTERN_TRANSFER_PLAN_INTEGRITY_FAILED"); const target = path.join(root, "sessions", "pattern-transfer-plans", `${plan.planId}.json`); const persisted = JSON.parse(await fs.readFile(target, "utf8")); persisted.guard.status = "blocked"; await fs.writeFile(target, JSON.stringify(persisted)); await expect(readPatternTransferPlan(root, plan.planId)).rejects.toThrow("PATTERN_TRANSFER_PLAN_INTEGRITY_FAILED"); });
});
