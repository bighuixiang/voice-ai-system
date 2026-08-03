import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { assertEvaluationRunArchiveIntegrity, createEvaluationRunArchive } from "./evaluationRunArchive.js";
import { persistEvaluationRunArchive, readEvaluationRunArchive } from "./evaluationRunArchive.js";

describe("evaluation run archive", () => {
  it("freezes all replay inputs, raw judgments and release conclusion", () => {
    const archive = createEvaluationRunArchive({ runId: "run-1", suiteFingerprint: "suite-sha", caseRefs: ["case://1"], candidateRefs: ["candidate://1"], inputFingerprint: "input-sha", modelVersion: "model-v2", promptVersion: "prompt-v3", contextFingerprint: "context-sha", evaluatorVersion: "eval-v1", seeds: [1, 2], usage: { inputTokens: 100, outputTokens: 30, costCents: 4, latencyMs: 800 }, rawJudgments: [{ evaluatorId: "judge-1", verdict: "accept", confidence: 0.8, evidenceRefs: ["anchor://1"] }], aggregationRule: "hard-gate-then-author-goal", releaseConclusion: "experimental", reproducibility: "replayable" });
    expect(archive).toMatchObject({ schemaVersion: "evaluation-run-archive.v1", releaseConclusion: "experimental", reproducibility: "replayable" });
    expect(() => assertEvaluationRunArchiveIntegrity(archive)).not.toThrow();
  });

  it("requires a limitation explanation when exact replay is unavailable", () => {
    expect(() => createEvaluationRunArchive({ runId: "run-2", suiteFingerprint: "suite", caseRefs: ["case"], candidateRefs: ["candidate"], inputFingerprint: "input", modelVersion: "model", promptVersion: "prompt", contextFingerprint: "context", evaluatorVersion: "eval", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "uncertain", confidence: 0.2, evidenceRefs: ["anchor"] }], aggregationRule: "rule", releaseConclusion: "blocked", reproducibility: "limited" })).toThrow("EVALUATION_RUN_LIMITATION_REQUIRED");
  });

  it("rejects structurally invalid archives even when an attacker recomputes the fingerprint", () => {
    const archive = createEvaluationRunArchive({ runId: "run-shape-1", suiteFingerprint: "suite", caseRefs: ["case"], candidateRefs: ["candidate"], inputFingerprint: "input", modelVersion: "model", promptVersion: "prompt", contextFingerprint: "context", evaluatorVersion: "eval", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "accept", confidence: 1, evidenceRefs: ["anchor"] }], aggregationRule: "rule", releaseConclusion: "approved", reproducibility: "replayable" });
    const tamperedBase = { ...archive, releaseConclusion: "invalid" as never };
    const tampered = { ...tamperedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify((({ fingerprint: _fingerprint, ...rest }) => rest)(tamperedBase))).digest("hex") };
    expect(() => assertEvaluationRunArchiveIntegrity(tampered)).toThrow("EVALUATION_RUN_ARCHIVE_INTEGRITY_FAILED");
  });

  it("rejects a rehashed archive with an unknown evaluation scope", () => {
    const archive = createEvaluationRunArchive({ runId: "run-scope-1", suiteFingerprint: "suite", caseRefs: ["case"], candidateRefs: ["candidate"], inputFingerprint: "input", modelVersion: "model", promptVersion: "prompt", contextFingerprint: "context", evaluatorVersion: "eval", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "accept", confidence: 1, evidenceRefs: ["anchor"] }], aggregationRule: "rule", releaseConclusion: "experimental", reproducibility: "replayable" });
    const { fingerprint: _fingerprint, ...base } = archive;
    const forgedBase = { ...base, evaluationScope: "internal-only" as never };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertEvaluationRunArchiveIntegrity(forged as typeof archive)).toThrow("EVALUATION_RUN_ARCHIVE_INTEGRITY_FAILED");
  });

  it("persists immutable archives idempotently and rejects replacement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-archive-"));
    try {
      const archive = createEvaluationRunArchive({ runId: "run-store-1", suiteFingerprint: "suite-sha", caseRefs: ["case://1"], candidateRefs: ["candidate://1"], inputFingerprint: "input-sha", modelVersion: "model-v2", promptVersion: "prompt-v3", contextFingerprint: "context-sha", evaluatorVersion: "eval-v1", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "accept", confidence: 1, evidenceRefs: ["anchor://1"] }], aggregationRule: "rule", releaseConclusion: "approved", reproducibility: "replayable" });
      await expect(persistEvaluationRunArchive(root, archive)).resolves.toEqual(archive);
      await expect(persistEvaluationRunArchive(root, archive)).resolves.toEqual(archive);
      await expect(readEvaluationRunArchive(root, archive.runId)).resolves.toEqual(archive);
      const replacement = createEvaluationRunArchive({ runId: archive.runId, suiteFingerprint: "suite-sha", caseRefs: ["case://1"], candidateRefs: ["candidate://1"], inputFingerprint: "input-sha", modelVersion: "model-v2", promptVersion: "prompt-v3", contextFingerprint: "context-sha", evaluatorVersion: "eval-v1", seeds: [1], usage: { inputTokens: 1, outputTokens: 1, costCents: 1, latencyMs: 1 }, rawJudgments: [{ evaluatorId: "judge", verdict: "reject", confidence: 1, evidenceRefs: ["anchor://1"] }], aggregationRule: "rule", releaseConclusion: "blocked", reproducibility: "replayable" });
      await expect(persistEvaluationRunArchive(root, replacement)).rejects.toThrow("EVALUATION_RUN_ARCHIVE_IMMUTABLE");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
