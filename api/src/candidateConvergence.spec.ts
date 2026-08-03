import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createCandidateConvergence, recordCandidateIteration, readCandidateConvergence } from "./candidateConvergence.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "candidate-convergence-")); }
const input = (root: string) => ({ root, projectSlug: "demo", assetId: "chapter-1", targetProblem: "补足人物动机", stopAfterUnimproved: 3, sourceRefs: ["review://1"] });
describe("candidate convergence and divergence stop", () => {
  it("records iterations with preserved and degraded items", async () => { const r = await root(); const run = await createCandidateConvergence(input(r)); const next = await recordCandidateIteration(r, run.runId, { candidateId: "c1", similarityFingerprint: "s1", problemScore: 0.4, preserved: ["voice"], regressions: ["pace"], authorJudgment: "保留", reviewVerdict: "red", evidenceRefs: ["candidate://c1"] }); expect(next.iterations).toHaveLength(1); expect(next.iterations[0].regressions).toEqual(["pace"]); });
  it("pauses after repeated non-improvement or review oscillation", async () => { const r = await root(); const run = await createCandidateConvergence(input(r)); let current = run; for (let i = 0; i < 3; i += 1) current = await recordCandidateIteration(r, current.runId, { candidateId: `c${i}`, similarityFingerprint: "same", problemScore: 0.5, preserved: [], regressions: [], authorJudgment: "继续", reviewVerdict: i % 2 ? "blue" : "red", evidenceRefs: [`candidate://c${i}`] }); expect(current.status).toBe("paused"); expect(current.stopReason).toMatch(/UNIMPROVED|REVIEW_OSCILLATION/); });
  it("is idempotent and requires evidence", async () => { const r = await root(); const one = await createCandidateConvergence(input(r)); const two = await createCandidateConvergence(input(r)); expect(two.fingerprint).toBe(one.fingerprint); await expect(recordCandidateIteration(r, one.runId, { candidateId: "c", similarityFingerprint: "s", problemScore: 1, preserved: [], regressions: [], authorJudgment: "", reviewVerdict: "red", evidenceRefs: [] })).rejects.toThrow("CONVERGENCE_EVIDENCE_REQUIRED"); expect(await readCandidateConvergence(r, one.runId)).toEqual(one); });
  it("rejects duplicate candidate identity, invalid scores, and blank evidence", async () => {
    const r = await root();
    const run = await createCandidateConvergence(input(r));
    await expect(recordCandidateIteration(r, run.runId, { candidateId: "c1", similarityFingerprint: "", problemScore: Number.NaN, preserved: [], regressions: [], authorJudgment: "continue", reviewVerdict: "red", evidenceRefs: [""] })).rejects.toThrow("CONVERGENCE_ITERATION_INVALID");
    await recordCandidateIteration(r, run.runId, { candidateId: "c1", similarityFingerprint: "s1", problemScore: 0.5, preserved: [], regressions: [], authorJudgment: "continue", reviewVerdict: "red", evidenceRefs: ["candidate://1"] });
    await expect(recordCandidateIteration(r, run.runId, { candidateId: "c1", similarityFingerprint: "s2", problemScore: 0.4, preserved: [], regressions: [], authorJudgment: "continue", reviewVerdict: "blue", evidenceRefs: ["candidate://2"] })).rejects.toThrow("CONVERGENCE_CANDIDATE_DUPLICATE");
  });

  it("fails closed when the convergence run is tampered", async () => {
    const r = await root();
    const run = await createCandidateConvergence(input(r));
    const target = path.join(r, "sessions", "candidate-convergence", `${run.runId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    await fs.writeFile(target, JSON.stringify({ ...persisted, stopReason: "UNIMPROVED_TARGET" }), "utf8");
    await expect(readCandidateConvergence(r, run.runId)).rejects.toThrow("CONVERGENCE_INTEGRITY_FAILED");
  });
});
