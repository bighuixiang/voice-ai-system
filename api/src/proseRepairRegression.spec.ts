import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { reviewProseCandidate } from "./proseReview.js";
import { createProseRepairPlan } from "./proseRepairPlan.js";
import { createProseRepairCandidate } from "./proseRepairCandidate.js";
import { evaluateProseRepairRegression, readProseRepairRegression } from "./proseRepairRegression.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-repair-regression-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  const parent = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "TODO: repair this paragraph\nA protected scene beat.", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const parentReview = await reviewProseCandidate(root, parent);
  const plan = await createProseRepairPlan(root, parent, parentReview);
  return { root, parent, parentReview, plan };
}

describe("prose repair regression", () => {
  it("passes only when the finding is resolved and strengths remain", async () => {
    const { root, parent, parentReview, plan } = await fixture();
    const result = await createProseRepairCandidate({ root, plan, parent, content: "The bell stopped, leaving a question.\nA protected scene beat." });
    const dossier = await evaluateProseRepairRegression({ root, plan, parent, parentReview, repaired: result.candidate });
    expect(dossier).toMatchObject({ status: "passed", planId: plan.planId, canonicalUntouched: true });
    expect(dossier.improvements).toEqual(expect.arrayContaining([expect.objectContaining({ findingId: "placeholder-or-wrapper", status: "resolved" })]));
    expect(dossier.regressions).toEqual([]);
    expect((await readProseRepairRegression(root, dossier.regressionId))?.fingerprint).toBe(dossier.fingerprint);
  });

  it("blocks when the repair candidate still contains the red finding", async () => {
    const { root, parent, parentReview, plan } = await fixture();
    const result = await createProseRepairCandidate({ root, plan, parent, content: "TODO: still broken\nA protected scene beat." });
    const dossier = await evaluateProseRepairRegression({ root, plan, parent, parentReview, repaired: result.candidate });
    expect(dossier.status).toBe("blocked");
    expect(dossier.regressions).toEqual(expect.arrayContaining([expect.objectContaining({ findingId: "placeholder-or-wrapper" })]));
  });
});
