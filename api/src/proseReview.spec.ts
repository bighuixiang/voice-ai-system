import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { assertRedBlueReviewIntegrity, readRedBlueReview, reviewProseCandidate } from "./proseReview.js";

async function fixture(content: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-review-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content, outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: `source-${crypto.createHash("sha256").update(content).digest("hex")}` });
  return { root, candidate };
}

describe("red blue prose review", () => {
  it("passes a clean candidate and records a blue strength", async () => {
    const { root, candidate } = await fixture("A clean scene.");
    const review = await reviewProseCandidate(root, candidate);
    expect(review).toMatchObject({ status: "passed", reviewer: { id: "red-blue-review-v1" }, blueStrengths: [expect.objectContaining({ strengthId: "non-empty-candidate" })] });
    expect(review.commonGround).toEqual(expect.arrayContaining([expect.objectContaining({ claimId: "candidate-bound" })]));
    expect(review.blueArgument.claims).toEqual(expect.arrayContaining([expect.objectContaining({ claimId: "non-empty-candidate" })]));
    expect(review.redArgument.falsifiers.length).toBeGreaterThan(0);
    expect(review.verdict).toBe("supports-adoption");
    expect(review.recommendation).toBe("adopt");
  });

  it("blocks unresolved generation placeholders as a hard red finding", async () => {
    const { root, candidate } = await fixture("TODO: replace this scene");
    const review = await reviewProseCandidate(root, candidate);
    expect(review.status).toBe("blocked");
    expect(review.redFindings).toEqual(expect.arrayContaining([expect.objectContaining({ findingId: "placeholder-or-wrapper", severity: "hard" })]));
    expect(review.verdict).toBe("blocks-adoption");
    expect(review.recommendation).toBe("repair");
  });

  it("fails closed when the durable red-blue review is tampered", async () => {
    const { root, candidate } = await fixture("A clean scene.");
    const review = await reviewProseCandidate(root, candidate);
    const target = path.join(root, "sessions", "prose-reviews", `${candidate.candidateId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.verdict = "blocks-adoption";
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    expect(review.verdict).toBe("supports-adoption");
    await expect(readRedBlueReview(root, candidate.candidateId)).rejects.toThrow("PROSE_REVIEW_INTEGRITY_FAILED");
  });

  it("rejects a validation bundle that belongs to a different candidate", async () => {
    const { root, candidate } = await fixture("A clean scene.");
    const review = await reviewProseCandidate(root, candidate);
    await expect(reviewProseCandidate(root, candidate, { ...({} as typeof review), candidateId: "other", candidateFingerprint: "other", validationBundleFingerprint: review.validationBundleFingerprint })).rejects.toThrow("PROSE_REVIEW_INPUT_MISMATCH");
  });
  it("rejects semantically invalid but re-signed review results", async () => { const { root, candidate } = await fixture("A clean scene."); const review = await reviewProseCandidate(root, candidate); const { fingerprint: _fingerprint, ...base } = review; const tampered = { ...base, recommendation: "adopt", reviewer: { kind: "independent-deterministic", id: "wrong-reviewer" }, fingerprint: crypto.createHash("sha256").update(JSON.stringify({ ...base, recommendation: "adopt", reviewer: { kind: "independent-deterministic", id: "wrong-reviewer" } })).digest("hex") }; expect(() => assertRedBlueReviewIntegrity(tampered as typeof review)).toThrow("PROSE_REVIEW_INTEGRITY_FAILED"); });
});
