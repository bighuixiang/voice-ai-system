import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createReviewIsolationSession, submitReview, synthesizeReview, readReviewIsolationSession } from "./reviewIsolation.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "review-isolation-")); }
const input = (root: string) => ({ root, projectSlug: "demo", candidateId: "candidate-1", baselineFingerprint: "baseline-1", generatedSelfClaims: ["人物鲜活", "质量达标"], sourceRefs: ["prose://candidate-1"] });
describe("generation and review isolation", () => {
  it("freezes one baseline and records independent blue/red reviews", async () => { const r = await root(); const session = await createReviewIsolationSession(input(r)); const blue = await submitReview(r, session.sessionId, { side: "blue", verdict: "retain", findings: ["voice works"], evidenceRefs: ["review://blue"] }); const red = await submitReview(r, session.sessionId, { side: "red", verdict: "fail", findings: ["motivation gap"], evidenceRefs: ["review://red"] }); expect(blue.baselineFingerprint).toBe("baseline-1"); expect(red.baselineFingerprint).toBe("baseline-1"); const synthesis = await synthesizeReview(r, session.sessionId, { decision: "repair locally", evidenceRefs: ["review://synthesis"] }); expect(synthesis.status).toBe("synthesized"); });
  it("blocks synthesis without independent red/blue evidence and ignores self claims", async () => { const r = await root(); const session = await createReviewIsolationSession(input(r)); expect(session.status).toBe("awaiting-reviews"); await expect(synthesizeReview(r, session.sessionId, { decision: "accept", evidenceRefs: ["x"] })).rejects.toThrow("INDEPENDENT_REVIEWS_REQUIRED"); const blue = await submitReview(r, session.sessionId, { side: "blue", verdict: "retain", findings: [], evidenceRefs: ["review://blue"] }); expect(blue.status).toBe("awaiting-reviews"); expect(blue.generatedSelfClaims).toEqual(input(r).generatedSelfClaims); });
  it("is idempotent and requires frozen baseline/evidence", async () => { const r = await root(); const one = await createReviewIsolationSession(input(r)); const two = await createReviewIsolationSession(input(r)); expect(two.fingerprint).toBe(one.fingerprint); await expect(createReviewIsolationSession({ ...input(r), baselineFingerprint: "" })).rejects.toThrow("REVIEW_BASELINE_REQUIRED"); await expect(submitReview(r, one.sessionId, { side: "red", verdict: "fail", findings: [], evidenceRefs: [] })).rejects.toThrow("REVIEW_EVIDENCE_REQUIRED"); expect(await readReviewIsolationSession(r, one.sessionId)).toEqual(one); });

  it("fails closed when an isolated review session is tampered", async () => {
    const r = await root();
    const session = await createReviewIsolationSession(input(r));
    const target = path.join(r, "sessions", "review-isolation", `${session.sessionId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    await fs.writeFile(target, JSON.stringify({ ...persisted, baselineFingerprint: "tampered" }), "utf8");
    await expect(readReviewIsolationSession(r, session.sessionId)).rejects.toThrow("REVIEW_ISOLATION_INTEGRITY_FAILED");
  });
});
