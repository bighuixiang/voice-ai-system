import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertEvaluationCaseIntegrity, createEvaluationCase } from "./evaluationCase.js";
import { persistEvaluationCase, readEvaluationCase } from "./evaluationCase.js";

describe("evaluation case feedback loop", () => {
  it("creates a replayable privacy-minimized case from a concrete defect", () => {
    const evaluationCase = createEvaluationCase({ caseId: "case-1", trigger: "author-correction", defectCategory: "pov-leak", candidateRef: "candidate://1", inputFingerprint: "input-sha", expectedGuardRefs: ["guard://pov"], fixVersion: "strategy-v2" });
    expect(evaluationCase).toMatchObject({ replayable: true, containsPrivateText: false, defectCategory: "pov-leak" });
    expect(() => assertEvaluationCaseIntegrity(evaluationCase)).not.toThrow();
  });

  it("rejects cases without a deterministic guard or with tampered metadata", () => {
    expect(() => createEvaluationCase({ caseId: "case-2", trigger: "production-regression", defectCategory: "drift", candidateRef: "candidate://2", inputFingerprint: "sha", expectedGuardRefs: [], fixVersion: "v1" })).toThrow("EVALUATION_CASE_FIELDS_INVALID");
    const evaluationCase = createEvaluationCase({ caseId: "case-3", trigger: "adoption-reversal", defectCategory: "flat", candidateRef: "candidate://3", inputFingerprint: "sha", expectedGuardRefs: ["guard://quality"], fixVersion: "v1" });
    expect(() => assertEvaluationCaseIntegrity({ ...evaluationCase, fixVersion: "v2" })).toThrow("EVALUATION_CASE_INTEGRITY_FAILED");
  });

  it("rejects a rehashed case with an unsupported trigger or missing identity", () => {
    const evaluationCase = createEvaluationCase({ caseId: "case-4", trigger: "author-correction", defectCategory: "pov-leak", candidateRef: "candidate://4", inputFingerprint: "sha", expectedGuardRefs: ["guard://pov"], fixVersion: "v1" });
    const { fingerprint: _fingerprint, ...base } = evaluationCase;
    const forgedBase = { ...base, trigger: "manual" as never, caseId: "" };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertEvaluationCaseIntegrity(forged as typeof evaluationCase)).toThrow("EVALUATION_CASE_INTEGRITY_FAILED");
  });

  it("persists replayable cases immutably and supports read-back", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-case-"));
    try {
      const evaluationCase = createEvaluationCase({ caseId: "case-store-1", trigger: "author-correction", defectCategory: "pov-leak", candidateRef: "candidate://1", inputFingerprint: "input-sha", expectedGuardRefs: ["guard://pov"], fixVersion: "strategy-v2" });
      await expect(persistEvaluationCase(root, evaluationCase)).resolves.toMatchObject({ created: true });
      await expect(readEvaluationCase(root, evaluationCase.caseId)).resolves.toEqual(evaluationCase);
      const replacement = createEvaluationCase({ caseId: evaluationCase.caseId, trigger: "production-regression", defectCategory: "different", candidateRef: "candidate://2", inputFingerprint: "input-sha-2", expectedGuardRefs: ["guard://different"], fixVersion: "strategy-v3" });
      await expect(persistEvaluationCase(root, replacement)).rejects.toThrow("EVALUATION_CASE_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
