import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningRelease, readLearningRelease, rollbackLearningRelease, rollbackLearningReleaseForRegression, rollbackLearningReleasesForRegression, assertCraftPatternReleaseRefs } from "./learningRelease.js";
import { propagateCraftSourceRevocation } from "./craftRevocationPropagation.js";
import { persistCraftRevocationRecord } from "./craftRevocationStore.js";
import { evaluateMultiScaleRegression } from "./evaluationSampling.js";
import { persistEvaluationRegression } from "./evaluationRegressionStore.js";
import crypto from "node:crypto";

describe("learning release persistence", () => {
  it("fails closed when a rehashed release has inconsistent canary and rollback semantics", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-integrity-"));
    const release = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-integrity", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:integrity"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    const { fingerprint: _fingerprint, ...base } = release;
    const forgedBase = { ...base, status: "canary" as const, canaryActive: false, rollbackRef: null };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    await fs.writeFile(path.join(root, "sessions", "learning-releases", "release-integrity.json"), JSON.stringify(forged), "utf8");

    await expect(readLearningRelease(root, "release-integrity")).rejects.toThrow("LEARNING_RELEASE_INTEGRITY_FAILED");
  });

  it("persists a governed default/canary decision and supports idempotent replay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-"));
    const input = {
      root,
      projectSlug: "project-a",
      releaseId: "release-1",
      candidatePolicyRef: "policy:candidate:v2",
      baselinePolicyRef: "policy:stable:v1",
      evaluationRunRefs: ["eval:1", "eval:2"],
      shadowAcceptanceDelta: 0.12,
      hardVoiceFailuresDelta: 0,
      reworkDelta: -0.03,
      canaryActive: true,
      previousStableVersion: "policy:stable:v1",
      approvedBy: "author-1"
    } as const;
    const first = await createLearningRelease(input);
    expect(first.status).toBe("canary");
    expect(first.projectSlug).toBe("project-a");
    expect(first.rollbackRef).toBe("policy:stable:v1");
    expect(await readLearningRelease(root, "release-1")).toMatchObject({ fingerprint: first.fingerprint, status: "canary" });
    expect(await createLearningRelease(input)).toEqual(first);
  });

  it("rejects regressions unless canary rollback is explicit, then persists rollback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-"));
    const release = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-2", candidatePolicyRef: "policy:candidate:v3", baselinePolicyRef: "policy:stable:v2", evaluationRunRefs: ["eval:3"], shadowAcceptanceDelta: -0.1, hardVoiceFailuresDelta: 0.2, reworkDelta: 0.1, canaryActive: false, previousStableVersion: "policy:stable:v2", approvedBy: "author-1" });
    expect(release.status).toBe("rejected");
    await expect(rollbackLearningRelease({ root, releaseId: "release-2", rolledBackBy: "author-1", reason: "regression confirmed" })).rejects.toThrow("LEARNING_RELEASE_ROLLBACK_NOT_ALLOWED");

    const canary = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-3", candidatePolicyRef: "policy:candidate:v4", baselinePolicyRef: "policy:stable:v2", evaluationRunRefs: ["eval:4"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable:v2", approvedBy: "author-1" });
    expect(canary.status).toBe("canary");
    const rolledBack = await rollbackLearningRelease({ root, releaseId: canary.releaseId, rolledBackBy: "author-1", reason: "keep stable baseline" });
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.rollbackReason).toBe("keep stable baseline");
  });

  it("binds a release to a validated project pattern and rejects an unverified pattern", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-pattern-"));
    await expect(createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-pattern-missing", candidatePatternId: "pattern-missing", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:pattern"], shadowAcceptanceDelta: 0, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: false, previousStableVersion: "policy:stable", approvedBy: "author" })).rejects.toThrow("LEARNING_RELEASE_PATTERN_REQUIRED");
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-validated", projectSlug: "project-a", name: "Validated rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-1"], evidenceRefs: ["evidence://pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-2", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    const patternFingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(patternBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", "pattern-validated.json"), JSON.stringify({ ...patternBase, fingerprint: patternFingerprint }), "utf8");
    const release = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-pattern-valid", candidatePatternId: "pattern-validated", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:pattern"], shadowAcceptanceDelta: 0, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    expect(release.candidatePatternId).toBe("pattern-validated");
  });

  it("blocks consumption when the released pattern is later invalidated by source revocation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-revocation-"));
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-revoked", projectSlug: "project-a", name: "Revoked rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-revoked"], evidenceRefs: ["evidence://pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-revoked", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    const patternFingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(patternBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", "pattern-revoked.json"), JSON.stringify({ ...patternBase, fingerprint: patternFingerprint }), "utf8");
    await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-revoked", candidatePatternId: "pattern-revoked", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:revoked"], shadowAcceptanceDelta: 0, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    const propagation = propagateCraftSourceRevocation({ sourceId: "rights-revoked", eventId: "revoke-pattern", sourceFingerprint: "source-fingerprint", reason: "license withdrawn", evidenceRefs: ["evidence://withdrawal"], sourceRefs: ["source://rights-revoked"], artifacts: [{ artifactId: "pattern-revoked", kind: "pattern", sourceIds: ["rights-revoked"], status: "active" }] });
    await persistCraftRevocationRecord(root, { projectSlug: "project-a", propagation });
    await expect(assertCraftPatternReleaseRefs(root, "project-a", ["pattern-revoked"])).rejects.toThrow("PROSE_MANIFEST_CRAFT_PATTERN_REVOKED");
  });

  it("fails closed when a prose manifest references a missing craft pattern", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-missing-pattern-"));

    await expect(assertCraftPatternReleaseRefs(root, "project-a", ["pattern-missing"]))
      .rejects.toThrow("PROSE_MANIFEST_CRAFT_PATTERN_NOT_FOUND");
  });

  it("fails closed when a craft pattern belongs to another project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-foreign-pattern-"));
    const patternId = "pattern-foreign-project";
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId, projectSlug: "project-b", name: "Foreign rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-foreign"], evidenceRefs: ["evidence://foreign-pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-foreign", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${patternId}.json`), JSON.stringify({ ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") }), "utf8");

    await expect(assertCraftPatternReleaseRefs(root, "project-a", [patternId]))
      .rejects.toThrow("PROSE_MANIFEST_CRAFT_PATTERN_PROJECT_MISMATCH");
  });

  it("does not consume an expired active release", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-expiry-"));
    const patternBase = { schemaVersion: "craft-pattern.v1", patternId: "pattern-expired", projectSlug: "project-a", name: "Expired rhythm", mechanism: "controlled pacing", narrativeFunction: "pressure", applicability: ["chase"], counterexamples: ["static exposition"], sourceEnvelopeIds: ["rights-expiry"], evidenceRefs: ["evidence://pattern"], lifecycle: "validated", status: "candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), validation: { experimentId: "experiment-expiry", actor: "author", reason: "holdout confirmed", validatedAt: new Date().toISOString() } };
    const patternFingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(patternBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", "pattern-expired.json"), JSON.stringify({ ...patternBase, fingerprint: patternFingerprint }), "utf8");
    await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-expired", candidatePatternId: "pattern-expired", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:expiry"], shadowAcceptanceDelta: 0, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author", expiresAt: "2000-01-01T00:00:00.000Z" });
    await expect(assertCraftPatternReleaseRefs(root, "project-a", ["pattern-expired"])).rejects.toThrow("PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED");
  });

  it("persists regression case references with a release for replayable rollback evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-regression-"));
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.7 }, candidate: { selection: 0.8 }, hardFailures: [] });
    await persistEvaluationRegression(root, { regressionId: "regression-case-1", projectSlug: "project-a", result });
    await persistEvaluationRegression(root, { regressionId: "regression-case-2", projectSlug: "project-a", result });
    const release = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-regression", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:regression"], regressionCaseRefs: ["regression-case-1", "regression-case-2"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    expect(release.regressionCaseRefs).toEqual(["regression-case-1", "regression-case-2"]);
    expect(await readLearningRelease(root, release.releaseId)).toMatchObject({ regressionCaseRefs: ["regression-case-1", "regression-case-2"] });
  });

  it("rejects missing or foreign-project regression evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-regression-gate-"));
    const input = { root, projectSlug: "project-a", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:1"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" } as const;
    await expect(createLearningRelease({ ...input, releaseId: "release-missing-regression", regressionCaseRefs: ["missing-regression"] })).rejects.toThrow("LEARNING_RELEASE_REGRESSION_EVIDENCE_REQUIRED");
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.7 }, candidate: { selection: 0.8 }, hardFailures: [] });
    await persistEvaluationRegression(root, { regressionId: "foreign-regression", projectSlug: "project-b", result });
    await expect(createLearningRelease({ ...input, releaseId: "release-foreign-regression", regressionCaseRefs: ["foreign-regression"] })).rejects.toThrow("LEARNING_RELEASE_REGRESSION_PROJECT_MISMATCH");
  });

  it("rolls back a release only when a bound regression case is confirmed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-regression-rollback-"));
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] });
    await persistEvaluationRegression(root, { regressionId: "regression-confirmed", projectSlug: "project-a", result });
    const release = await createLearningRelease({ root, projectSlug: "project-a", releaseId: "release-regression-rollback", candidatePolicyRef: "policy:candidate", baselinePolicyRef: "policy:stable", evaluationRunRefs: ["eval:rollback"], regressionCaseRefs: ["regression-confirmed"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    await expect(rollbackLearningReleaseForRegression({ root, projectSlug: "project-a", releaseId: release.releaseId, regressionCaseRef: "regression-confirmed", rolledBackBy: "regression-gate", reason: "Holdout regression detected" })).resolves.toMatchObject({ status: "rolled_back", rollbackReason: "Holdout regression detected [regression:regression-confirmed]" });
    await expect(rollbackLearningReleaseForRegression({ root, projectSlug: "project-a", releaseId: release.releaseId, regressionCaseRef: "regression-confirmed", rolledBackBy: "regression-gate", reason: "repeat" })).resolves.toMatchObject({ status: "rolled_back" });
  });

  it("automatically rolls back every active release bound to a confirmed regression", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-release-regression-broadcast-"));
    const result = evaluateMultiScaleRegression({ baseline: { selection: 0.8 }, candidate: { selection: 0.4 }, hardFailures: ["voice"] });
    await persistEvaluationRegression(root, { regressionId: "regression-broadcast", projectSlug: "project-a", result });
    for (const releaseId of ["release-broadcast-1", "release-broadcast-2"]) {
      await createLearningRelease({ root, projectSlug: "project-a", releaseId, candidatePolicyRef: `policy:${releaseId}`, baselinePolicyRef: "policy:stable", evaluationRunRefs: [`eval:${releaseId}`], regressionCaseRefs: ["regression-broadcast"], shadowAcceptanceDelta: 0.1, hardVoiceFailuresDelta: 0, reworkDelta: 0, canaryActive: true, previousStableVersion: "policy:stable", approvedBy: "author" });
    }
    const rolledBack = await rollbackLearningReleasesForRegression({ root, projectSlug: "project-a", regressionCaseRef: "regression-broadcast", rolledBackBy: "regression-gate", reason: "Automatic propagation" });
    expect(rolledBack).toHaveLength(2);
    expect(rolledBack.every((release) => release.status === "rolled_back")).toBe(true);
  });
});
