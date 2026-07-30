import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStoryContractReadinessProof, readStoryContractReadinessProof } from "./contractReadiness.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(root: string, includeWorld = true) {
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const fields = [{ fieldId: "desire", path: "protagonist.primaryDesire", value: "Expose the truth.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "q1" }], sourceDecisionId: "d1", lock: "unlocked" }, ...(includeWorld ? [{ fieldId: "world", path: "world.rules.primary", value: "Memory is the toll.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "q2" }], sourceDecisionId: "d2", lock: "unlocked" }] : [])];
  const candidate = { schemaVersion: "story-contract-candidate.v1", candidateId: "candidate-1", projectSlug: "demo", status: "candidate", sourceDecisionId: "d1", sourceFingerprint: "a".repeat(64), fields, contract: { protagonist: { primaryDesire: "Expose the truth.", innerNeed: null, misbelief: null }, conflict: { core: null, opposingPressure: null }, stakes: { failureCost: null, irreversibleChoice: null }, world: { primaryRule: includeWorld ? "Memory is the toll." : null }, readerPromise: null, endingDirection: null }, unknowns: [], canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "c".repeat(64) };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "candidate-1.json"), JSON.stringify(candidate), "utf8");
  await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify({ schemaVersion: "story-contract-adoption-proposal.v1", proposalId: "proposal-1", candidateId: "candidate-1", candidateFingerprint: candidate.fingerprint, projectSlug: "demo", status: "committed", fieldDecisions: fields.map((field) => ({ fieldId: field.fieldId, status: "accept" })), acceptedFields: fields, unresolvedFieldIds: [], reviewId: "review-1", canonWritten: true, createdAt: new Date().toISOString(), fingerprint: "p".repeat(64) }), "utf8");
  const reviewBase = { schemaVersion: "understanding-review.v1", reviewId: "review-1", projectSlug: "demo", snapshotId: "snapshot-1", snapshotFingerprint: candidate.sourceFingerprint, calibrationVersion: "understanding-calibration.v1", reviewer: { kind: "independent-deterministic", id: "reviewer" }, status: "passed", checks: [], canonWritten: false, createdAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, "sessions", "understanding-review.json"), JSON.stringify({ ...reviewBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(reviewBase)).digest("hex") }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), JSON.stringify({ mutationId: "m1" }) + "\n", "utf8");
  const receiptBase = { schemaVersion: "projection-rebuild-receipt.v1", receiptId: "receipt-1", projectSlug: "demo", mutationIds: ["m1"], projections: [], createdAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, "sessions", "projection-rebuild-receipt.json"), JSON.stringify({ ...receiptBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(receiptBase)).digest("hex") }), "utf8");
}

describe("story contract readiness proof", () => {
  it("proves ready only when required fields, evidence, authorization and projections are current", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-readiness-"));
    roots.push(root);
    await fixture(root);
    const proof = await buildStoryContractReadinessProof(root, "demo");
    expect(proof).toMatchObject({ status: "ready", projectionStatus: "current", blockingReasons: [] });
    expect(proof.contractFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "protagonist.primaryDesire", status: "confirmed" }),
      expect.objectContaining({ path: "world.rules.primary", status: "confirmed" }),
      expect.objectContaining({ path: "stakes.failureCost", status: "missing" }),
      expect.objectContaining({ path: "endingDirection", status: "missing" })
    ]));
    expect(await readStoryContractReadinessProof(root)).toEqual(proof);
  });

  it("reports partial fields and blocks missing authorization or stale projections", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-readiness-"));
    roots.push(root);
    await fixture(root, false);
    const partial = await buildStoryContractReadinessProof(root, "demo");
    expect(partial).toMatchObject({ status: "partial" });
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify({ ...(JSON.parse(await fs.readFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), "utf8"))), status: "ready_for_authorization", canonWritten: false }), "utf8");
    await fs.appendFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), JSON.stringify({ mutationId: "m2" }) + "\n", "utf8");
    const blocked = await buildStoryContractReadinessProof(root, "demo");
    expect(blocked.status).toBe("blocked");
    expect(blocked.blockingReasons).toEqual(expect.arrayContaining(["AUTHOR_AUTHORIZED_COMMIT_REQUIRED", "PROJECTION_STALE"]));
  });
});
