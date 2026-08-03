import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertCraftExperimentIntegrity, attachCraftProviderEvaluation, attachCraftReaderCalibration, createCraftExperiment, judgeCraftExperiment, listCraftExperiments, readCraftExperiment, startCraftExperiment, recordCraftExperimentDecision } from "./craftExperiment.js";
import type { PatternTransferPlan } from "./patternTransfer.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-experiment-"));
  const plan: PatternTransferPlan = { schemaVersion: "pattern-transfer-plan.v1", planId: "plan-1", projectSlug: "demo", patternId: "pattern-1", sourceEnvelopeId: "rights-1", targetChapterId: "chapter-1", intendedEffect: "raise pressure", prohibitedActions: ["copy-source-wording"], guard: { schemaVersion: "similarity-guard-result.v1", guardId: "guard-1", sourceVersion: "s1", targetVersion: "t1", overlapRatio: 0.1, maxTokenOverlap: 0.35, status: "passed", risk: "low", evidenceRefs: ["similarity://s1/t1"], createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "guard" }, status: "candidate", canonWriteAllowed: false, createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "plan" };
  return { root, plan };
}

describe("craft experiment lifecycle", () => {
  it("freezes baseline, candidate, holdout, and budget before running", async () => {
    const { root, plan } = await fixture();
    const experiment = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: ["scene-holdout-1"], targetMetrics: ["pressure", "redundancy"], budgetId: "budget-1" });
    expect(experiment.status).toBe("planned");
    expect(experiment.holdoutSceneIds).toEqual(["scene-holdout-1"]);
    expect(await readCraftExperiment(root, experiment.experimentId)).toEqual(experiment);
  });

  it("separates the experiment runner from the independent judgment", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: ["scene-holdout-1"], targetMetrics: ["pressure"], budgetId: "budget-1" });
    const running = await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "generator-1" });
    expect(running.status).toBe("running");
    const judged = await judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer-1", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "More pressure without copying." });
    expect(judged.status).toBe("judged");
    expect(judged.judgment?.evaluatorId).toBe("reviewer-1");
  });

  it("persists sealed cross-scene holdout evidence with the independent judgment", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-holdout", treatmentCandidateId: "treatment-holdout", holdoutSceneIds: ["scene-investigate", "scene-aftermath"], targetMetrics: ["pressure"], budgetId: "budget-holdout" });
    await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "generator-holdout" });
    const judged = await judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer-holdout", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Cross-scene holdout confirms the bounded effect.", holdout: { extractionSceneIds: ["scene-extract"], sourceRefs: ["holdout://sealed-1"], cases: [
      { caseId: "holdout-investigate", sceneId: "scene-investigate", chapterFunction: "investigation", inputFingerprint: "input-investigate", labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.7, hardGuardsPassed: true },
      { caseId: "holdout-aftermath", sceneId: "scene-aftermath", chapterFunction: "aftermath", inputFingerprint: "input-aftermath", labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.65, hardGuardsPassed: true },
    ] } });
    expect(judged.holdoutValidation?.status).toBe("cross-scene-validated");
    expect(judged.holdoutValidation?.generatorInput).toEqual([{ caseId: "holdout-investigate", inputFingerprint: "input-investigate" }, { caseId: "holdout-aftermath", inputFingerprint: "input-aftermath" }]);
    expect(await readCraftExperiment(root, planned.experimentId)).toMatchObject({ holdoutValidation: { status: "cross-scene-validated" } });
  });

  it("blocks a judgment when holdout labels leak or extraction overlaps", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-blocked-holdout", treatmentCandidateId: "treatment-blocked-holdout", holdoutSceneIds: ["scene"], targetMetrics: ["pressure"], budgetId: "budget-blocked-holdout" });
    await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "generator" });
    await expect(judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "The leaked holdout must block release.", holdout: { extractionSceneIds: ["scene"], sourceRefs: ["holdout://leak"], cases: [{ caseId: "holdout-leak", sceneId: "scene", chapterFunction: "investigation", inputFingerprint: "input", labelSealed: false, generatorVisible: true, baselineScore: 0.4, treatmentScore: 0.7, hardGuardsPassed: true }] } })).rejects.toThrow("CRAFT_EXPERIMENT_HOLDOUT_BLOCKED");
  });

  it("rejects holdout evidence that is outside the frozen experiment scene set", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-scope", treatmentCandidateId: "treatment-scope", holdoutSceneIds: ["scene-allowed"], targetMetrics: ["pressure"], budgetId: "budget-scope" });
    await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "generator" });
    await expect(judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Scope must be frozen.", holdout: { extractionSceneIds: ["scene-extract"], sourceRefs: ["holdout://scope"], cases: [{ caseId: "holdout-foreign", sceneId: "scene-foreign", chapterFunction: "investigation", inputFingerprint: "input", labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.7, hardGuardsPassed: true }] } })).rejects.toThrow("CRAFT_EXPERIMENT_HOLDOUT_SCENE_MISMATCH");
  });

  it("persists the provider evaluation report used by the experiment", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-provider", treatmentCandidateId: "treatment-provider", holdoutSceneIds: ["scene-provider"], targetMetrics: ["pressure"], budgetId: "budget-provider" });
    const report = { schemaVersion: "provider-evaluation-report.v1" as const, providerRef: "provider://real-v1", invocationCount: 4, completedCount: 4, effectiveOutputRate: 1, totalInputTokens: 40, totalOutputTokens: 80, totalCost: { amount: 4, currency: "USD", measurement: "actual" as const }, latencyMs: { p50: 100, p95: 180, max: 220 }, quality: { status: "calibrated" as const, accuracy: 0.9, evidenceRef: "calibration://human-v1" }, decision: "pass" as const, blockedReasons: [], fingerprint: "report-fingerprint" };
    const attached = await attachCraftProviderEvaluation({ root, experimentId: planned.experimentId, report });
    expect(attached.providerEvaluation).toMatchObject({ providerRef: "provider://real-v1", decision: "pass", totalCost: { measurement: "actual" } });
    expect(await readCraftExperiment(root, planned.experimentId)).toMatchObject({ providerEvaluation: { providerRef: "provider://real-v1" } });
  });

  it("persists calibrated reader-review evidence separately from canon reaction", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-reader", treatmentCandidateId: "treatment-reader", holdoutSceneIds: ["scene-reader"], targetMetrics: ["reader-effect"], budgetId: "budget-reader" });
    const calibration = { schemaVersion: "reader-reviewer.v1" as const, reviewerId: "reader-reviewer-v1", status: "calibrated" as const, humanSamples: 8, blind: true, agreementRate: 0.875, fingerprint: "reader-calibration-fingerprint" };
    const attached = await attachCraftReaderCalibration({ root, experimentId: planned.experimentId, calibration });
    expect(attached.readerCalibration).toMatchObject({ status: "calibrated", humanSamples: 8, blind: true });
    expect(await readCraftExperiment(root, planned.experimentId)).toMatchObject({ readerCalibration: { reviewerId: "reader-reviewer-v1" } });
  });

  it("fails closed for a missing holdout or evaluator that matches the runner", async () => {
    const { root, plan } = await fixture();
    await expect(createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: [], targetMetrics: ["pressure"], budgetId: "budget-1" })).rejects.toThrow("CRAFT_EXPERIMENT_HOLDOUT_REQUIRED");
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "baseline-1", treatmentCandidateId: "treatment-1", holdoutSceneIds: ["scene-1"], targetMetrics: ["pressure"], budgetId: "budget-1" });
    await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "runner-1" });
    await expect(judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "runner-1", evaluatorKind: "independent-reviewer", winner: "baseline", hardGuardsPassed: true, authorReason: "same actor" })).rejects.toThrow("CRAFT_EXPERIMENT_EVALUATOR_NOT_INDEPENDENT");
    const failed = await judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer-1", evaluatorKind: "independent-reviewer", winner: "uncertain", hardGuardsPassed: false, authorReason: "Guard failed." });
    expect(failed.status).toBe("failed");
  });

  it("lists experiments by project and tolerates a missing catalog", async () => {
    const { root, plan } = await fixture();
    const experiment = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "b", treatmentCandidateId: "t", holdoutSceneIds: ["s"], targetMetrics: ["pressure"], budgetId: "budget" });
    expect(await listCraftExperiments(root, "other")).toEqual([]);
    expect((await listCraftExperiments(root, "demo")).map((item) => item.experimentId)).toEqual([experiment.experimentId]);
  });
  it("freezes comparison dimensions, rejects non-equivalent candidates, and records author decision", async () => {
    const { root, plan } = await fixture();
    await expect(createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "same", treatmentCandidateId: "same", holdoutSceneIds: ["s"], targetMetrics: ["pressure"], budgetId: "budget" })).rejects.toThrow("CRAFT_EXPERIMENT_CANDIDATES_NOT_EQUIVALENT");
    const experiment = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "b", treatmentCandidateId: "t", holdoutSceneIds: ["s"], targetMetrics: ["pressure"], budgetId: "budget" });
    expect(experiment.comparisonDimensions).toEqual(expect.arrayContaining(["contract-fit", "author-choice", "revision-cost", "voice", "redundancy", "reader-effect"]));
    await expect(recordCraftExperimentDecision({ root, experimentId: experiment.experimentId, actor: "author", decision: "adopt", reason: "" })).rejects.toThrow("CRAFT_EXPERIMENT_DECISION_REASON_REQUIRED");
    await startCraftExperiment({ root, experimentId: experiment.experimentId, runnerId: "runner" });
    await judgeCraftExperiment({ root, experimentId: experiment.experimentId, evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "better" });
    const decided = await recordCraftExperimentDecision({ root, experimentId: experiment.experimentId, actor: "author", decision: "adopt", reason: "Author selected the lower revision cost." });
    expect(decided.decision).toMatchObject({ actor: "author", decision: "adopt" });
  });
  it("rejects duplicate holdouts and detects persisted tampering", async () => { const { root, plan } = await fixture(); await expect(createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "b", treatmentCandidateId: "t", holdoutSceneIds: ["s", "s"], targetMetrics: ["pressure"], budgetId: "budget" })).rejects.toThrow("CRAFT_EXPERIMENT_HOLDOUT_REQUIRED"); const experiment = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "b2", treatmentCandidateId: "t2", holdoutSceneIds: ["s"], targetMetrics: ["pressure"], budgetId: "budget" }); expect(() => assertCraftExperimentIntegrity({ ...experiment, projectSlug: "tampered" })).toThrow("CRAFT_EXPERIMENT_INTEGRITY_FAILED"); });
  it("rejects tampered nested judgment and list entries", async () => {
    const { root, plan } = await fixture();
    const planned = await createCraftExperiment({ root, projectSlug: "demo", transferPlan: plan, baselineCandidateId: "b3", treatmentCandidateId: "t3", holdoutSceneIds: ["s"], targetMetrics: ["pressure"], budgetId: "budget" });
    await startCraftExperiment({ root, experimentId: planned.experimentId, runnerId: "runner" });
    const judged = await judgeCraftExperiment({ root, experimentId: planned.experimentId, evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "better" });
    expect(() => assertCraftExperimentIntegrity({ ...judged, judgment: { ...judged.judgment!, authorReason: "tampered" } })).toThrow("CRAFT_EXPERIMENT_INTEGRITY_FAILED");
    const file = path.join(root, "sessions", "craft-experiments", `${planned.experimentId}.json`);
    const persisted = JSON.parse(await fs.readFile(file, "utf8"));
    persisted.judgment.authorReason = "tampered";
    await fs.writeFile(file, JSON.stringify(persisted));
    await expect(listCraftExperiments(root, "demo")).rejects.toThrow("CRAFT_EXPERIMENT_INTEGRITY_FAILED");
  });
});
