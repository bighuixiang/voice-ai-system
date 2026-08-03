import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateChapterAssetCoverage,
  assertChapterMemoryPatchIntegrity,
  createChapterMemoryPatch,
  persistChapterMemoryPatch,
  readChapterMemoryPatch,
  evaluateMemoryPatchAdoption
} from "./chapterMemoryPatch.js";

const base = () => ({
  patchId: "patch-c1-v1",
  chapterId: "chapter-001",
  chapterVersion: "chapter-001:v1",
  sourceRefs: ["chapter-settlement://chapter-001"],
  summary: "The bell answered.",
  keyEvents: ["The bell rang"],
  newFacts: ["The tide carries voices"],
  characterStates: [{ characterId: "keeper", change: "Trusts the witness" }],
  emotionLedger: [{ characterId: "keeper", emotion: "fear", delta: 1 }],
  foreshadowingActions: [{ obligationId: "ob-1", action: "reinforced" as const }],
  continuityRisks: [{ riskId: "risk-1", severity: "medium" as const, description: "Tide timing" }],
  growthChanges: [{ characterId: "keeper", change: "Accepts help" }]
});

describe("chapter memory patch", () => {
  it("requires all eight memory surfaces and fingerprints the candidate", () => {
    const patch = createChapterMemoryPatch(base());
    expect(patch).toMatchObject({ schemaVersion: "chapter-memory-patch.v1", chapterId: "chapter-001", status: "candidate" });
    expect(patch.coverage).toEqual({ summary: true, keyEvents: true, newFacts: true, characterStates: true, emotionLedger: true, foreshadowingActions: true, continuityRisks: true, growthChanges: true });
    expect(patch.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an empty patch without an explicit no-change reason", () => {
    expect(() => createChapterMemoryPatch({ ...base(), summary: "", keyEvents: [], newFacts: [], characterStates: [], emotionLedger: [], foreshadowingActions: [], continuityRisks: [], growthChanges: [] })).toThrow("MEMORY_PATCH_NO_CHANGE_REASON_REQUIRED");
    expect(createChapterMemoryPatch({ ...base(), summary: "", keyEvents: [], newFacts: [], characterStates: [], emotionLedger: [], foreshadowingActions: [], continuityRisks: [], growthChanges: [], noChangeReason: "No canon, state, or obligation changed." })).toMatchObject({ noChangeReason: "No canon, state, or obligation changed." });
  });

  it("classifies low, medium, and high-risk changes with fail-closed author gating", () => {
    const patch = createChapterMemoryPatch({ ...base(), newFacts: [{ value: "A new fact", risk: "low" as const }], characterStates: [{ characterId: "keeper", change: "Trusts the witness", risk: "medium" as const }], foreshadowingActions: [{ obligationId: "ob-1", action: "resolved" as const, risk: "high" as const }] });
    expect(evaluateMemoryPatchAdoption(patch, { mode: "auto", authorConfirmed: false })).toMatchObject({ status: "blocked", requiredConfirmation: "author" });
    expect(evaluateMemoryPatchAdoption(patch, { mode: "auto", authorConfirmed: true })).toMatchObject({ status: "ready", requiredConfirmation: "author" });
  });

  it("persists patches immutably and reports chapter asset coverage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-memory-patch-"));
    const patch = createChapterMemoryPatch(base());
    await expect(persistChapterMemoryPatch(root, patch)).resolves.toMatchObject({ fingerprint: patch.fingerprint });
    await expect(readChapterMemoryPatch(root, patch.patchId)).resolves.toMatchObject({ fingerprint: patch.fingerprint });
    await expect(persistChapterMemoryPatch(root, { ...patch, summary: "tampered" })).rejects.toThrow("MEMORY_PATCH_IMMUTABLE");
    const coverage = calculateChapterAssetCoverage([
      { chapterId: "chapter-001", prose: true, summary: true, qualityReport: true, knowledgeIndex: true, foreshadowingExtraction: true },
      { chapterId: "chapter-002", prose: true, summary: false, qualityReport: true, knowledgeIndex: false, foreshadowingExtraction: false }
    ]);
    expect(coverage).toMatchObject({ chapterCount: 2, assets: { prose: 2, summary: 1, qualityReport: 2, knowledgeIndex: 1, foreshadowingExtraction: 1 } });
    expect(coverage.coverageRate.summary).toBe(0.5);
  });
  it("rejects a re-signed patch with missing surfaces or false coverage", () => { const patch = createChapterMemoryPatch(base()); const { fingerprint: _fingerprint, ...basePatch } = patch; const invalidBase = { ...basePatch, keyEvents: [], coverage: { ...basePatch.coverage, keyEvents: false } }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertChapterMemoryPatchIntegrity(invalid as typeof patch)).toThrow("MEMORY_PATCH_INTEGRITY_FAILED"); });
});
