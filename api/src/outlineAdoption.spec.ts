import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { authorizeOutlineAdoption, createOutlineAdoptionProposal, readOutlineAdoptionProposal } from "./outlineAdoption.js";
import { validateOutlineCandidate } from "./outlineValidation.js";
import { compareCandidates } from "./candidateComparison.js";
import { persistCandidateComparison } from "./candidateComparisonStore.js";
import { contractAdoptionProposalFingerprint, type ContractAdoptionProposal } from "./contractAdoption.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture(contractAdopted = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-adoption-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const candidate = {
    schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-demo", projectSlug: "demo", status: "candidate", sourceDecisionId: "decision-1", sourceFingerprint: "source-1", fields: [],
    contract: { protagonist: { primaryDesire: "open the sealed gate", innerNeed: null, misbelief: null }, conflict: { core: "The gate demands a sacrifice.", opposingPressure: null }, stakes: { failureCost: "The valley loses its memory.", irreversibleChoice: null }, world: { primaryRule: null }, readerPromise: null, endingDirection: "Truth costs the protagonist their old identity." }, assumptions: [], impactSummary: [], unknowns: [], canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "c".repeat(64)
  };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json"), JSON.stringify(candidate), "utf8");
  if (contractAdopted) {
    const base = {
      schemaVersion: "story-contract-adoption-proposal.v1" as const,
      proposalId: `contract-adoption-${candidate.candidateId}`,
      candidateId: candidate.candidateId,
      candidateFingerprint: candidate.fingerprint,
      projectSlug: candidate.projectSlug,
      status: "committed" as const,
      fieldDecisions: [{ fieldId: "field-1", status: "accept" as const }],
      acceptedFields: [{ fieldId: "field-1", path: "protagonist.primaryDesire", value: "open the sealed gate", epistemicStatus: "explicit" as const, evidenceRefs: [{ kind: "dialogue-question", refId: "question-primary-desire" }], sourceDecisionId: candidate.sourceDecisionId, lock: "unlocked" as const }],
      unresolvedFieldIds: [],
      reviewId: "review-1",
      canonWritten: true as const,
      createdAt: new Date().toISOString(),
      committedMutationId: "mutation-contract-1",
      committedAt: new Date().toISOString()
    };
    const committed: ContractAdoptionProposal = { ...base, fingerprint: contractAdoptionProposalFingerprint(base) };
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify(committed), "utf8");
  }
  const { outline } = await compileOutlineCandidate(root, candidate.candidateId);
  await validateOutlineCandidate(root, outline.outlineId);
  return { root, outline };
}

describe("outline adoption proposal", () => {
  it("rejects an outline adoption proposal when its source contract is not canon", async () => {
    const { root, outline } = await fixture(false);

    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint })).rejects.toThrow("OUTLINE_SOURCE_CONTRACT_NOT_ADOPTED");
  });

  it("creates a validated, author-authorization-ready proposal without canon writes", async () => {
    const { root, outline } = await fixture();
    const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint, selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"] });
    expect(proposal).toMatchObject({ status: "ready_for_authorization", selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"], canonWritten: false });
    const authorized = await authorizeOutlineAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "outline-auth-1" } });
    expect(authorized).toMatchObject({ status: "authorized", canonWritten: false, authorAuthorization: { actorId: "author-1" } });
    expect(await readOutlineAdoptionProposal(root)).toEqual(authorized);
  });

  it("fails closed when a persisted adoption proposal is tampered", async () => {
    const { root, outline } = await fixture();
    const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint });
    const target = path.join(root, "sessions", "outline-adoption-proposal.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.status = "authorized";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readOutlineAdoptionProposal(root)).rejects.toThrow("OUTLINE_ADOPTION_PROPOSAL_INTEGRITY_FAILED");
    expect(proposal.status).toBe("ready_for_authorization");
  });

  it("records the adoption mode and every chapter left unadopted", async () => {
    const { root, outline } = await fixture();
    const proposal = await createOutlineAdoptionProposal(root, {
      outlineId: outline.outlineId,
      expectedOutlineFingerprint: outline.fingerprint,
      adoptionMode: "partial",
      selectedChapterIds: ["chapter-001", "chapter-003"],
      unadoptedChapterIds: outline.chapters.map((chapter) => chapter.chapterId).filter((chapterId) => !["chapter-001", "chapter-003"].includes(chapterId))
    });
    expect(proposal).toMatchObject({ adoptionMode: "partial" });
  });

  it("binds adoption to an existing candidate comparison when supplied", async () => {
    const { root, outline } = await fixture();
    const comparison = await persistCandidateComparison(root, "demo", compareCandidates({ objectiveIds: ["voice"], candidates: [{ candidateId: outline.sourceCandidateId, hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "voice", gap: 0, evidenceRefs: ["evidence://voice"] }], unresolvedRisks: [] }] }));
    const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint, comparisonFingerprint: comparison.comparisonId });
    expect(proposal.comparisonFingerprint).toBe(comparison.comparisonId);
    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint, comparisonFingerprint: "f".repeat(64) })).rejects.toThrow("OUTLINE_COMPARISON_NOT_FOUND");
  });

  it("fails closed when unadopted parts do not match the selected subset", async () => {
    const { root, outline } = await fixture();
    await expect(createOutlineAdoptionProposal(root, {
      outlineId: outline.outlineId,
      expectedOutlineFingerprint: outline.fingerprint,
      adoptionMode: "partial",
      selectedChapterIds: ["chapter-001"],
      unadoptedChapterIds: ["chapter-003"]
    })).rejects.toThrow("OUTLINE_UNADOPTED_PARTS_MISMATCH");
  });

  it("blocks proposal creation when validation is absent or the outline fingerprint is stale", async () => {
    const { root, outline } = await fixture();
    await fs.rm(path.join(root, "sessions", "outline-validations", `${outline.outlineId}.json`));
    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint })).rejects.toThrow("OUTLINE_VALIDATION_REQUIRED");
    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: "stale" })).rejects.toThrow("OUTLINE_FINGERPRINT_STALE");
  });

  it("rejects empty author authorization before persisting an authorized proposal", async () => {
    const { root, outline } = await fixture();
    const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint });
    await expect(authorizeOutlineAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "", authorizationId: "" } })).rejects.toThrow("OUTLINE_ADOPTION_AUTHORIZATION_REQUIRED");
    expect((await readOutlineAdoptionProposal(root))?.status).toBe("ready_for_authorization");
  });
});
