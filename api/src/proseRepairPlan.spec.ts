import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { reviewProseCandidate } from "./proseReview.js";
import { assertProseRepairPlanIntegrity, createProseRepairPlan, readProseRepairPlan } from "./proseRepairPlan.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-repair-plan-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "TODO: repair this paragraph\nA protected scene beat.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const review = await reviewProseCandidate(root, candidate);
  return { root, candidate, review };
}

describe("evidence bounded prose repair plan", () => {
  it("plans at most three local repairs and protects verified strengths", async () => {
    const { root, candidate, review } = await fixture();
    const plan = await createProseRepairPlan(root, candidate, review);
    expect(plan).toMatchObject({ status: "ready", candidateId: candidate.candidateId, reviewFingerprint: review.fingerprint, scope: { kind: "local-span" } });
    expect(plan.targetFindings.length).toBeGreaterThan(0);
    expect(plan.targetFindings.length).toBeLessThanOrEqual(3);
    expect(plan.protectedStrengths).toContain("non-empty-candidate");
    expect(plan.prohibitedActions).toContain("replace-entire-chapter");
    expect(plan.authorDecisionRequired).toBe(true);
    expect((await readProseRepairPlan(root, plan.planId))?.fingerprint).toBe(plan.fingerprint);
  });

  it("does not create a repair plan for an adoptable candidate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-repair-plan-clean-"));
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
    await freezeContextManifest(root, "demo");
    const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "Clean scene.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
    const review = await reviewProseCandidate(root, candidate);
    await expect(createProseRepairPlan(root, candidate, review)).rejects.toThrow("PROSE_REPAIR_NOT_REQUIRED");
  });

  it("fails closed when a persisted repair plan has a valid hash but invalid status", async () => {
    const { root, candidate, review } = await fixture();
    const plan = await createProseRepairPlan(root, candidate, review);
    const target = path.join(root, "sessions", "prose-repair-plans", `${plan.planId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "committed";
    delete tampered.fingerprint;
    await fs.writeFile(target, JSON.stringify({ ...tampered, fingerprint: crypto.createHash("sha256").update(JSON.stringify(tampered)).digest("hex") }), "utf8");
    await expect(readProseRepairPlan(root, plan.planId)).rejects.toThrow("PROSE_REPAIR_PLAN_INTEGRITY_FAILED");
  });
  it("rejects a re-signed plan with invalid repair scope or rollback binding", async () => { const { root, candidate, review } = await fixture(); const plan = await createProseRepairPlan(root, candidate, review); const { fingerprint: _fingerprint, ...base } = plan; const invalidBase = { ...base, scope: { ...base.scope, maxChangedParagraphs: 0 }, rollbackPoint: { ...base.rollbackPoint, canonUntouched: false } }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertProseRepairPlanIntegrity(invalid as typeof plan)).toThrow("PROSE_REPAIR_PLAN_INTEGRITY_FAILED"); });
});
