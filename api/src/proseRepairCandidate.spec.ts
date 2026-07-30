import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { reviewProseCandidate } from "./proseReview.js";
import { createProseRepairPlan } from "./proseRepairPlan.js";
import { createProseRepairCandidate, readProseRepairCandidate } from "./proseRepairCandidate.js";

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
});
