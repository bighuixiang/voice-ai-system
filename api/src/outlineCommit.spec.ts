import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { authorizeOutlineAdoption, createOutlineAdoptionProposal } from "./outlineAdoption.js";
import { commitOutlineAdoption, readExecutionReadyProof, readOutlineVersion } from "./outlineCommit.js";
import { validateOutlineCandidate } from "./outlineValidation.js";
import { compareCandidates } from "./candidateComparison.js";
import { persistCandidateComparison } from "./candidateComparisonStore.js";
import { checkExecutionReadiness } from "./executionReadiness.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture(withComparison = false) {
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
  const comparison = withComparison ? await persistCandidateComparison(root, "demo", compareCandidates({ objectiveIds: ["contract"], candidates: [{ candidateId: candidate.candidateId, hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "contract", gap: 0, evidenceRefs: ["decision://1"] }], unresolvedRisks: [] }]})) : undefined;
  const proposal = await createOutlineAdoptionProposal(root, { outlineId: outline.outlineId, expectedOutlineFingerprint: outline.fingerprint, ...(comparison ? { comparisonFingerprint: comparison.comparisonId } : {}) });
  const authorized = await authorizeOutlineAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "auth-1" } });
  return { root, outline, authorized, comparison };
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

  it("carries the candidate comparison fingerprint into the version and execution proof", async () => {
    const { root, authorized, comparison } = await fixture(true);
    const result = await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint });
    expect(comparison).toBeTruthy();
    expect(result.version?.comparisonFingerprint).toBe(comparison?.comparisonId);
    expect(result.proof?.comparisonFingerprint).toBe(comparison?.comparisonId);
    expect((await readOutlineVersion(root, "outline-candidate-contract-candidate-demo"))?.comparisonFingerprint).toBe(comparison?.comparisonId);
    expect((await readExecutionReadyProof(root))?.comparisonFingerprint).toBe(comparison?.comparisonId);
    expect((await checkExecutionReadiness(root, "chapter-001")).allowed).toBe(true);
  });

  it("fails closed when the persisted execution-ready proof is tampered", async () => {
    const { root, authorized } = await fixture();
    await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint });
    const target = path.join(root, "sessions", "execution-ready-proof.json");
    const proof = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    proof.status = "blocked";
    await fs.writeFile(target, JSON.stringify(proof), "utf8");
    await expect(readExecutionReadyProof(root)).rejects.toThrow("EXECUTION_READY_PROOF_INTEGRITY_FAILED");
  });

  it("fails closed when the persisted outline version is tampered", async () => {
    const { root, outline, authorized } = await fixture();
    await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint });
    const target = path.join(root, "sessions", "outline-versions", `${outline.outlineId}.json`);
    const version = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    version.status = "invalid";
    await fs.writeFile(target, JSON.stringify(version), "utf8");
    await expect(readOutlineVersion(root, outline.outlineId)).rejects.toThrow("OUTLINE_VERSION_INTEGRITY_FAILED");
  });

  it("fails closed when a persisted outline version freezes more chapters than it selects", async () => {
    const { root, outline, authorized } = await fixture();
    await commitOutlineAdoption(root, { expectedProposalFingerprint: authorized.fingerprint });
    const target = path.join(root, "sessions", "outline-versions", `${outline.outlineId}.json`);
    const version = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown> & { selectedChapterIds: string[]; strongFreezeCount: number; fingerprint: string };
    version.strongFreezeCount = version.selectedChapterIds.length + 1;
    const { fingerprint: _fingerprint, ...base } = version;
    version.fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(target, JSON.stringify(version), "utf8");
    await expect(readOutlineVersion(root, outline.outlineId)).rejects.toThrow("OUTLINE_VERSION_INTEGRITY_FAILED");
  });
});
