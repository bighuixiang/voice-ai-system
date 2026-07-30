import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { authorizeOutlineAdoption, createOutlineAdoptionProposal } from "./outlineAdoption.js";
import { commitOutlineAdoption, readExecutionReadyProof, readOutlineVersion } from "./outlineCommit.js";
import { validateOutlineCandidate } from "./outlineValidation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-commit-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "demo", title: "Demo" }), "utf8");
  const candidate = {
    schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-demo", projectSlug: "demo", status: "candidate", sourceDecisionId: "decision-1", sourceFingerprint: "source-1", fields: [],
    contract: { protagonist: { primaryDesire: "open the sealed gate", innerNeed: null, misbelief: null }, conflict: { core: "The gate demands a sacrifice.", opposingPressure: null }, stakes: { failureCost: "The valley loses its memory.", irreversibleChoice: null }, world: { primaryRule: null }, readerPromise: null, endingDirection: "Truth costs the protagonist their old identity." }, assumptions: [], impactSummary: [], unknowns: [], canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "candidate-1"
  };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json"), JSON.stringify(candidate), "utf8");
  const { outline } = await compileOutlineCandidate(root, candidate.candidateId);
  await validateOutlineCandidate(root, outline.outlineId);
  const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint });
  const authorized = await authorizeOutlineAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "auth-1" } });
  return { root, outline, authorized };
}

describe("outline version commit", () => {
  it("atomically commits an authorized outline and emits an execution-ready proof", async () => {
    const { root, outline, authorized } = await fixture();
    const result = await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint });
    expect(result).toMatchObject({ status: "committed", canonWritten: true, version: { outlineId: outline.outlineId, canonWritten: true }, proof: { status: "ready", executionReady: true } });
    expect(JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8")).outlineVersion.versionId).toBe(result.version?.versionId);
    expect(await readOutlineVersion(root, outline.outlineId)).toEqual(result.version);
    expect(await readExecutionReadyProof(root)).toEqual(result.proof);
  });

  it("rolls back all writes on a fault after the project pointer write", async () => {
    const { root, authorized } = await fixture();
    const before = await fs.readFile(path.join(root, "project.json"), "utf8");
    const result = await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint, faultAt: "after-project-write" });
    expect(result).toMatchObject({ status: "rolled_back", canonWritten: false, reason: "INJECTED_FAULT" });
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(before);
    expect(await readOutlineVersion(root, "outline-candidate-contract-candidate-demo")).toBeNull();
    expect(await readExecutionReadyProof(root)).toBeNull();
  });
});
