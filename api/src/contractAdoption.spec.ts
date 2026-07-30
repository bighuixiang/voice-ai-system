import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createContractAdoptionProposal, readContractAdoptionProposal } from "./contractAdoption.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function setup(root: string, reviewStatus: "passed" | "blocked" = "passed") {
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const candidate = {
    schemaVersion: "story-contract-candidate.v1",
    candidateId: "contract-candidate-decision-1",
    projectSlug: "demo",
    status: "candidate",
    sourceDecisionId: "decision-1",
    sourceFingerprint: "a".repeat(64),
    fields: [{ fieldId: "field-1", path: "protagonist.primaryDesire", value: "Expose the truth.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-primary-desire" }], sourceDecisionId: "decision-1", lock: "unlocked" }],
    unknowns: ["core conflict"],
    canonWritten: false,
    createdAt: new Date().toISOString(),
    fingerprint: "c".repeat(64)
  };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", `${candidate.candidateId}.json`), JSON.stringify(candidate), "utf8");
  const reviewBase = { schemaVersion: "understanding-review.v1", reviewId: "review-1", projectSlug: "demo", snapshotId: "snapshot-1", snapshotFingerprint: "a".repeat(64), calibrationVersion: "understanding-calibration.v1", reviewer: { kind: "independent-deterministic", id: "reviewer" }, status: reviewStatus, checks: [], canonWritten: false, createdAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, "sessions", "understanding-review.json"), JSON.stringify({ ...reviewBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(reviewBase)).digest("hex") }), "utf8");
  return candidate;
}

describe("contract adoption proposal", () => {
  it("creates a field-complete proposal without writing canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-adoption-"));
    roots.push(root);
    const candidate = await setup(root);
    const result = await createContractAdoptionProposal(root, { candidateId: candidate.candidateId, expectedCandidateFingerprint: candidate.fingerprint, fieldDecisions: [{ fieldId: "field-1", status: "accept", reason: "Author confirmed." }] });
    expect(result.proposal).toMatchObject({ status: "ready_for_authorization", candidateId: candidate.candidateId, canonWritten: false, acceptedFields: [{ fieldId: "field-1" }] });
    expect(await readContractAdoptionProposal(root)).toEqual(result.proposal);
    await expect(fs.stat(path.join(root, "project.json"))).rejects.toThrow();
  });

  it("fails closed when review is blocked or a field decision is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-adoption-"));
    roots.push(root);
    const candidate = await setup(root, "blocked");
    await expect(createContractAdoptionProposal(root, { candidateId: candidate.candidateId, expectedCandidateFingerprint: candidate.fingerprint, fieldDecisions: [{ fieldId: "field-1", status: "accept" }] })).resolves.toMatchObject({ proposal: null, error: "INDEPENDENT_REVIEW_REQUIRED" });
    await setup(root, "passed");
    await expect(createContractAdoptionProposal(root, { candidateId: candidate.candidateId, expectedCandidateFingerprint: candidate.fingerprint, fieldDecisions: [] })).resolves.toMatchObject({ proposal: null, error: "FIELD_DECISION_REQUIRED" });
  });

  it("keeps a partial adoption authorizable without promoting rejected fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-adoption-"));
    roots.push(root);
    const candidate = await setup(root);
    const candidatePath = path.join(root, "sessions", "contract-candidates", `${candidate.candidateId}.json`);
    const expanded = {
      ...candidate,
      fields: [
        ...candidate.fields,
        { fieldId: "field-conflict", path: "conflict.core", value: "A costly symbiosis", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-conflict" }], sourceDecisionId: "decision-1", lock: "unlocked" }
      ]
    };
    await fs.writeFile(candidatePath, JSON.stringify(expanded), "utf8");
    const result = await createContractAdoptionProposal(root, {
      candidateId: candidate.candidateId,
      expectedCandidateFingerprint: candidate.fingerprint,
      fieldDecisions: [
        { fieldId: "field-1", status: "accept", reason: "Keep the protagonist desire." },
        { fieldId: "field-conflict", status: "reject", reason: "Leave the conflict unknown for now." }
      ]
    });
    expect(result.proposal).toMatchObject({
      status: "ready_for_authorization",
      acceptedFields: [expect.objectContaining({ fieldId: "field-1" })],
      unresolvedFieldIds: ["field-conflict"]
    });
    expect(result.proposal?.acceptedFields.some((field) => field.fieldId === "field-conflict")).toBe(false);
  });
});
