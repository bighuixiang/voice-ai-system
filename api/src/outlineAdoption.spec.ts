import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { authorizeOutlineAdoption, createOutlineAdoptionProposal, readOutlineAdoptionProposal } from "./outlineAdoption.js";
import { validateOutlineCandidate } from "./outlineValidation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-adoption-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const candidate = {
    schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-demo", projectSlug: "demo", status: "candidate", sourceDecisionId: "decision-1", sourceFingerprint: "source-1", fields: [],
    contract: { protagonist: { primaryDesire: "open the sealed gate", innerNeed: null, misbelief: null }, conflict: { core: "The gate demands a sacrifice.", opposingPressure: null }, stakes: { failureCost: "The valley loses its memory.", irreversibleChoice: null }, world: { primaryRule: null }, readerPromise: null, endingDirection: "Truth costs the protagonist their old identity." }, assumptions: [], impactSummary: [], unknowns: [], canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "candidate-1"
  };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json"), JSON.stringify(candidate), "utf8");
  const { outline } = await compileOutlineCandidate(root, candidate.candidateId);
  await validateOutlineCandidate(root, outline.outlineId);
  return { root, outline };
}

describe("outline adoption proposal", () => {
  it("creates a validated, author-authorization-ready proposal without canon writes", async () => {
    const { root, outline } = await fixture();
    const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint, selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"] });
    expect(proposal).toMatchObject({ status: "ready_for_authorization", selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"], canonWritten: false });
    const authorized = await authorizeOutlineAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "outline-auth-1" } });
    expect(authorized).toMatchObject({ status: "authorized", canonWritten: false, authorAuthorization: { actorId: "author-1" } });
    expect(await readOutlineAdoptionProposal(root)).toEqual(authorized);
  });

  it("blocks proposal creation when validation is absent or the outline fingerprint is stale", async () => {
    const { root, outline } = await fixture();
    await fs.rm(path.join(root, "sessions", "outline-validations", `${outline.outlineId}.json`));
    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint })).rejects.toThrow("OUTLINE_VALIDATION_REQUIRED");
    await expect(createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: "stale" })).rejects.toThrow("OUTLINE_FINGERPRINT_STALE");
  });
});
