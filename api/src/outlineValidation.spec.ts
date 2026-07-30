import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport, validateOutlineCandidate } from "./outlineValidation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-validation-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const candidate = {
    schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-demo", projectSlug: "demo", status: "candidate", sourceDecisionId: "decision-1", sourceFingerprint: "decision-fingerprint", fields: [],
    contract: { protagonist: { primaryDesire: "open the sealed gate", innerNeed: null, misbelief: null }, conflict: { core: "The gate demands a sacrifice.", opposingPressure: null }, stakes: { failureCost: "The valley loses its memory.", irreversibleChoice: null }, world: { primaryRule: null }, readerPromise: null, endingDirection: "Truth costs the protagonist their old identity." }, assumptions: [], impactSummary: [], unknowns: [], canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "candidate-fingerprint"
  };
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json"), JSON.stringify(candidate), "utf8");
  const { outline } = await compileOutlineCandidate(root, candidate.candidateId);
  return { root, outline };
}

describe("outline validation report", () => {
  it("passes a contract-anchored causal candidate without making it execution ready", async () => {
    const { root, outline } = await fixture();
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report).toMatchObject({ status: "passed", executionReady: false, outlineFingerprint: outline.fingerprint });
    expect(report?.checks.every((item) => item.status === "passed")).toBe(true);
    expect(await readOutlineValidationReport(root, outline.outlineId)).toEqual(report);
  });

  it("blocks a candidate whose source fingerprint has become stale", async () => {
    const { root, outline } = await fixture();
    const candidatePath = path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json");
    const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
    await fs.writeFile(candidatePath, JSON.stringify({ ...candidate, fingerprint: "changed-fingerprint" }), "utf8");
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.status).toBe("blocked");
    expect(report?.checks.find((item) => item.checkId === "source-fingerprint")?.status).toBe("failed");
  });
});
