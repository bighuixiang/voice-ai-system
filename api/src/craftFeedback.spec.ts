import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordCraftFeedback, readCraftFeedbackEvent } from "./craftFeedback.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-feedback-"));
  const base = {
    schemaVersion: "craft-experiment.v1",
    experimentId: "experiment-feedback",
    projectSlug: "project-a",
    transferPlanId: "plan-1",
    baselineCandidateId: "baseline-1",
    treatmentCandidateId: "treatment-1",
    holdoutSceneIds: ["scene-1"],
    targetMetrics: ["voice"],
    comparisonDimensions: ["voice"],
    budgetId: "budget-1",
    status: "judged",
    judgment: {
      evaluatorId: "reviewer-1",
      evaluatorKind: "independent-reviewer",
      winner: "treatment",
      hardGuardsPassed: true,
      authorReason: "holdout supports treatment",
      judgedAt: new Date().toISOString(),
      fingerprint: ""
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as const;
  const judgmentBase = { ...base.judgment, fingerprint: undefined };
  delete (judgmentBase as { fingerprint?: unknown }).fingerprint;
  const judgment = { ...base.judgment, fingerprint: crypto.createHash("sha256").update(JSON.stringify(judgmentBase)).digest("hex") };
  const experimentBase = { ...base, judgment };
  const experiment = { ...experimentBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(experimentBase)).digest("hex") };
  await fs.mkdir(path.join(root, "sessions", "craft-experiments"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "craft-experiments", "experiment-feedback.json"), JSON.stringify(experiment), "utf8");
  return root;
}

describe("craft feedback events", () => {
  it("persists author rejection with scope and confounders and replays idempotently", async () => {
    const root = await fixture();
    const input = { root, projectSlug: "project-a", experimentId: "experiment-feedback", actor: "author-1", outcome: "rejected" as const, note: "Too ornamental in action scenes.", changedDimensions: ["pacing"], confounders: ["scene density"] };
    const first = await recordCraftFeedback(input);
    expect(first).toMatchObject({ projectSlug: "project-a", experimentId: "experiment-feedback", outcome: "rejected", changedDimensions: ["pacing"], confounders: ["scene density"] });
    expect(await recordCraftFeedback(input)).toEqual(first);
    expect(await readCraftFeedbackEvent(root, first.feedbackId)).toEqual(first);
  });

  it("does not cross the experiment project boundary", async () => {
    const root = await fixture();
    await expect(recordCraftFeedback({ root, projectSlug: "project-b", experimentId: "experiment-feedback", actor: "author-1", outcome: "edited", note: "Changed the turn.", changedDimensions: ["structure"], confounders: [] })).rejects.toThrow("CRAFT_FEEDBACK_PROJECT_MISMATCH");
  });
});
