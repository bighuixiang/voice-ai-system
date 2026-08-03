import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordCraftFeedback } from "./craftFeedback.js";
import { createCraftFeedbackAttribution, deriveCraftFeedbackPreference } from "./craftFeedbackLearning.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-feedback-learning-"));
  const writeExperiment = async (experimentId: string) => {
    const judgmentBase = { evaluatorId: `reviewer-${experimentId}`, evaluatorKind: "independent-reviewer" as const, winner: "treatment" as const, hardGuardsPassed: true, authorReason: "Treatment is bounded.", judgedAt: new Date().toISOString() };
    const judgment = { ...judgmentBase, fingerprint: (await import("node:crypto")).createHash("sha256").update(JSON.stringify(judgmentBase)).digest("hex") };
    const base = { schemaVersion: "craft-experiment.v1" as const, experimentId, projectSlug: "demo", transferPlanId: `plan-${experimentId}`, baselineCandidateId: `baseline-${experimentId}`, treatmentCandidateId: `treatment-${experimentId}`, holdoutSceneIds: [`scene-${experimentId}`], targetMetrics: ["voice"], comparisonDimensions: ["voice"], budgetId: `budget-${experimentId}`, status: "judged" as const, runnerId: `runner-${experimentId}`, judgment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-experiments", `${experimentId}.json`), JSON.stringify({ ...base, fingerprint }), "utf8");
  };
  return { root, writeExperiment };
}

describe("craft feedback learning adapter", () => {
  it("keeps one craft feedback as a scoped candidate and validates two independent experiments", async () => {
    const { root, writeExperiment } = await fixture();
    await writeExperiment("experiment-1");
    await writeExperiment("experiment-2");
    const first = await recordCraftFeedback({ root, projectSlug: "demo", experimentId: "experiment-1", actor: "author", outcome: "rejected", note: "Too ornate under pressure.", changedDimensions: ["pacing"], confounders: ["scene density"] });
    const second = await recordCraftFeedback({ root, projectSlug: "demo", experimentId: "experiment-2", actor: "author", outcome: "rejected", note: "Too ornate in a quieter scene.", changedDimensions: ["pacing"], confounders: ["scene density"] });
    const firstAttribution = await createCraftFeedbackAttribution({ root, feedbackId: first.feedbackId, pattern: "avoid-ornate-pacing", category: "structure", scope: { chapterId: "chapter-1" } });
    expect(firstAttribution.allowPreferenceLearning).toBe(false);
    expect((await deriveCraftFeedbackPreference({ root, attribution: firstAttribution })).lifecycle).toBe("candidate");
    const secondAttribution = await createCraftFeedbackAttribution({ root, feedbackId: second.feedbackId, pattern: "avoid-ornate-pacing", category: "structure", scope: { chapterId: "chapter-1" } });
    const hypothesis = await deriveCraftFeedbackPreference({ root, attribution: secondAttribution });
    expect(hypothesis.lifecycle).toBe("validated");
    expect(hypothesis.supportEventIds).toEqual([first.feedbackId, second.feedbackId]);
  });

  it("rejects foreign feedback and missing evidence", async () => {
    const { root, writeExperiment } = await fixture();
    await writeExperiment("experiment-foreign");
    const feedback = await recordCraftFeedback({ root, projectSlug: "demo", experimentId: "experiment-foreign", actor: "author", outcome: "edited", note: "Keep the turn sharper.", changedDimensions: ["causality"], confounders: [] });
    await expect(createCraftFeedbackAttribution({ root, feedbackId: "missing-feedback", pattern: "p", category: "structure", scope: {} })).rejects.toThrow("CRAFT_FEEDBACK_LEARNING_EVIDENCE_REQUIRED");
    await expect(createCraftFeedbackAttribution({ root, feedbackId: feedback.feedbackId, projectSlug: "foreign", pattern: "p", category: "structure", scope: {} })).rejects.toThrow("CRAFT_FEEDBACK_LEARNING_PROJECT_MISMATCH");
  });
});
