import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport, validateOutlineCandidate } from "./outlineValidation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function persistOutline(pathName: string, outline: Record<string, unknown>): Promise<void> {
  const { fingerprint: _old, ...base } = outline;
  await fs.writeFile(pathName, JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }), "utf8");
}

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

  it("blocks a causal chain when a chapter output is not consumed by the next chapter", async () => {
    const { root, outline } = await fixture();
    const outlinePath = path.join(root, "sessions", "outline-candidates", `${outline.outlineId}.json`);
    const changed = { ...outline, chapters: outline.chapters.map((chapter, index) => index === 0 ? { ...chapter, causalOutputs: ["orphan-outcome"] } : chapter) };
    await persistOutline(outlinePath, changed);
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.status).toBe("blocked");
    expect(report?.checks.find((item) => item.checkId === "causal-chain")?.status).toBe("failed");
  });

  it("blocks an outline missing the required near-horizon chapter functions", async () => {
    const { root, outline } = await fixture();
    const outlinePath = path.join(root, "sessions", "outline-candidates", `${outline.outlineId}.json`);
    const changed = { ...outline, chapters: outline.chapters.map((chapter) => ({ ...chapter, function: "complication" as const })) };
    await persistOutline(outlinePath, changed);
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.status).toBe("blocked");
    expect(report?.checks.find((item) => item.checkId === "chapter-functions")?.status).toBe("failed");
  });

  it("blocks distant chapter detail that is falsely marked committed", async () => {
    const { root, outline } = await fixture();
    const outlinePath = path.join(root, "sessions", "outline-candidates", `${outline.outlineId}.json`);
    const changed = { ...outline, chapters: outline.chapters.map((chapter, index) => index === 3 ? { ...chapter, confidence: "committed" as const, detailLevel: "detailed" as const } : chapter) };
    await persistOutline(outlinePath, changed);
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.status).toBe("blocked");
    expect(report?.checks.find((item) => item.checkId === "confidence-horizon")?.status).toBe("failed");
  });

  it("reports a no-change chapter with location, evidence, severity, and repair", async () => {
    const { root, outline } = await fixture();
    const outlinePath = path.join(root, "sessions", "outline-candidates", `${outline.outlineId}.json`);
    const unchanged = { ...outline, chapters: outline.chapters.map((chapter, index) => index === 2 ? { ...chapter, goal: outline.chapters[1].goal, conflict: outline.chapters[1].conflict, turningPoint: outline.chapters[1].turningPoint, causalInputs: outline.chapters[1].causalInputs, causalOutputs: outline.chapters[1].causalOutputs } : chapter) };
    await persistOutline(outlinePath, unchanged);
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.status).toBe("blocked");
    expect(report?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ checkId: "no-change-chapter", location: "chapter-003", severity: "error", repairCandidate: expect.any(String) })]));
  });

  it("blocks a climax that introduces an unforeshadowed rule", async () => {
    const { root, outline } = await fixture();
    const outlinePath = path.join(root, "sessions", "outline-candidates", `${outline.outlineId}.json`);
    const changed = { ...outline, chapters: outline.chapters.map((chapter, index) => index === outline.chapters.length - 1 ? { ...chapter, newRuleIds: ["rule-final"], foreshadowedRuleIds: [] } : chapter) };
    await persistOutline(outlinePath, changed);
    const report = await validateOutlineCandidate(root, outline.outlineId);
    expect(report?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ checkId: "unforeshadowed-climax", location: "chapter-005", severity: "error" })]));
  });

  it("fails closed when a persisted validation report is tampered", async () => {
    const { root, outline } = await fixture();
    const report = await validateOutlineCandidate(root, outline.outlineId);
    const reportPath = path.join(root, "sessions", "outline-validations", `${outline.outlineId}.json`);
    const tampered = JSON.parse(await fs.readFile(reportPath, "utf8")) as Record<string, unknown>;
    tampered.status = "blocked";
    await fs.writeFile(reportPath, JSON.stringify(tampered), "utf8");
    await expect(readOutlineValidationReport(root, outline.outlineId)).rejects.toThrow("OUTLINE_VALIDATION_REPORT_INTEGRITY_FAILED");
    expect(report?.status).toBe("passed");
  });
});
