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
});
