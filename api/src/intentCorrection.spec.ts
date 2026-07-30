import { describe, expect, it } from "vitest";
import { createIntentCorrection, propagateIntentCorrection } from "./intentCorrection.js";

describe("intent correction", () => {
  it("keeps old and corrected interpretations with affected assets", () => {
    const correction = createIntentCorrection({ correctionId: "c-1", priorInterpretation: "write a summary", correctedInterpretation: "write a scene", affectedAssets: ["chapter-1"], recommendation: "regenerate scene" });
    expect(correction.status).toBe("proposed");
    expect(correction.affectedAssets).toContain("chapter-1");
  });

  it("stales every affected downstream artifact and pauses running work", () => {
    const correction = createIntentCorrection({ correctionId: "c-2", priorInterpretation: "summary", correctedInterpretation: "scene", affectedAssets: ["chapter-1"], recommendation: "rebuild scene", status: "accepted" });
    const result = propagateIntentCorrection(correction, {
      understanding: [{ id: "u-1", affectedAssets: ["chapter-1"], status: "active" }, { id: "u-2", affectedAssets: ["chapter-2"], status: "active" }],
      questions: [{ id: "q-1", affectedAssets: ["chapter-1"], status: "open" }],
      plans: [{ id: "p-1", affectedAssets: ["chapter-1"], status: "ready" }],
      candidates: [{ id: "c-1", affectedAssets: ["chapter-1"], status: "reviewable" }],
      tasks: [{ id: "t-1", affectedAssets: ["chapter-1"], status: "running" }],
      patches: [{ id: "x-1", affectedAssets: ["chapter-1"], status: "pending" }]
    });
    expect(result).toMatchObject({ correctedInterpretation: "scene", minimalUnderstanding: "scene", affected: { understanding: ["u-1"], questions: ["q-1"], plans: ["p-1"], candidates: ["c-1"], tasks: ["t-1"], patches: ["x-1"] } });
    expect(result.transitions).toEqual(expect.arrayContaining([
      { artifactId: "t-1", artifactType: "task", from: "running", to: "paused" },
      { artifactId: "c-1", artifactType: "candidate", from: "reviewable", to: "stale" }
    ]));
    expect(result.recurrenceGuard).toContain("c-2");
  });
});
