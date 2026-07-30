import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCraftExperiment, judgeCraftExperiment, listCraftExperiments, readCraftExperiment, startCraftExperiment } from "./craftExperiment.js";
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
});
