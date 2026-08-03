import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { reviewProseCandidate } from "./proseReview.js";
import { createProseRepairPlan } from "./proseRepairPlan.js";
import { assertProseRepairCandidateIntegrity, createProseRepairCandidate, readProseRepairCandidate } from "./proseRepairCandidate.js";
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-repair-candidate-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "TODO: repair this paragraph\nA protected scene beat.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const review = await reviewProseCandidate(root, candidate);
  const plan = await createProseRepairPlan(root, candidate, review);
  return { root, candidate, plan };
}

describe("prose repair candidate", () => {
  it("creates a non-canon child candidate within the plan scope", async () => {
    const { root, candidate, plan } = await fixture();
    const repaired = await createProseRepairCandidate({ root, plan, parent: candidate, content: "The bell stopped, leaving a question.\nA protected scene beat." });
    expect(repaired.candidate).toMatchObject({ status: "generated", chapterId: "c1", generation: { outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1" } });
    expect(repaired.metadata).toMatchObject({ schemaVersion: "prose-repair-candidate.v1", planId: plan.planId, parentCandidateId: candidate.candidateId, status: "generated" });
    expect(repaired.metadata.changedParagraphIndexes).toEqual([0]);
    expect((await readProseRepairCandidate(root, repaired.metadata.repairCandidateId))?.fingerprint).toBe(repaired.metadata.fingerprint);
  });

  it("rejects a full-chapter replacement that exceeds the local plan", async () => {
    const { root, candidate, plan } = await fixture();
    await expect(createProseRepairCandidate({ root, plan, parent: candidate, content: "A totally different chapter.\nAnother unrelated chapter.\nA third rewrite." })).rejects.toThrow("PROSE_REPAIR_SCOPE_EXCEEDED");
  });

  it("inherits the parent's frozen generation manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-repair-rich-"));
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
    await freezeContextManifest(root, "demo");
    const manifest = createProseGenerationManifest({ manifestId: "manifest-repair-1", decisionConsumptionReceiptRef: "receipt:repair", storyContractRef: "contract:v1", outlineVersion: "outline-v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v1"], povStateRef: "pov:hero:v1", obligationRefs: ["obl:1"], authorLockRefs: ["lock:1"], craftPatternRefs: ["craft:1"], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v1", planningHorizonRef: "horizon:v1", contextManifestRef: "context:v1", sourceRefs: ["source:1"] });
    await persistProseGenerationManifest(root, manifest);
    const parent = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "TODO: repair this paragraph\nA protected scene beat.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-rich-parent", generationManifestId: manifest.manifestId });
    const review = await reviewProseCandidate(root, parent);
    const plan = await createProseRepairPlan(root, parent, review);
    const repaired = await createProseRepairCandidate({ root, plan, parent, content: "The bell stopped, leaving a question.\nA protected scene beat." });
    expect(repaired.candidate.generation).toMatchObject({ manifestId: manifest.manifestId, manifestFingerprint: manifest.fingerprint });
  });

  it("fails closed when repair metadata is semantically tampered despite a valid hash", async () => {
    const { root, candidate, plan } = await fixture();
    const repaired = await createProseRepairCandidate({ root, plan, parent: candidate, content: "The bell stopped, leaving a question.\nA protected scene beat." });
    const target = path.join(root, "sessions", "prose-repair-candidates", `${repaired.metadata.repairCandidateId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "committed";
    delete tampered.fingerprint;
    await fs.writeFile(target, JSON.stringify({ ...tampered, fingerprint: crypto.createHash("sha256").update(JSON.stringify(tampered)).digest("hex") }), "utf8");
    await expect(readProseRepairCandidate(root, repaired.metadata.repairCandidateId)).rejects.toThrow("PROSE_REPAIR_CANDIDATE_INTEGRITY_FAILED");
  });
  it("rejects a re-signed metadata record with invalid parent fingerprint or indexes", async () => { const { root, candidate, plan } = await fixture(); const repaired = await createProseRepairCandidate({ root, plan, parent: candidate, content: "The bell stopped, leaving a question.\nA protected scene beat." }); const { fingerprint: _fingerprint, ...base } = repaired.metadata; const invalidBase = { ...base, parentCandidateFingerprint: "not-a-fingerprint", changedParagraphIndexes: [-1] }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertProseRepairCandidateIntegrity(invalid as typeof repaired.metadata)).toThrow("PROSE_REPAIR_CANDIDATE_INTEGRITY_FAILED"); });
});
