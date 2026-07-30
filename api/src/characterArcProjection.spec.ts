import { describe, expect, it } from "vitest";
import { projectCharacterArcSeparation } from "./characterArcProjection.js";

describe("character arc plan/actual projection", () => {
  it("never treats a planned target as an observed change", () => {
    const result = projectCharacterArcSeparation({ arcId: "arc-1", lifecycle: "planned", startState: "isolated", targetChange: "trust", milestones: [] });
    expect(result.planned.targetChange).toBe("trust");
    expect(result.actual.changes).toEqual([]);
    expect(result.actual.status).toBe("unobserved");
  });

  it("projects only evidence-backed milestones as actual arc changes", () => {
    const result = projectCharacterArcSeparation({ arcId: "arc-1", lifecycle: "active", startState: "isolated", targetChange: "trust", milestones: [{ milestoneId: "m1", choiceEvidenceId: "choice-1", milestone: "chooses ally", actualChange: "accepts help", sourceRefs: ["chapter://1"], recordedAt: "2026-07-30T00:00:00Z" }] });
    expect(result.actual.status).toBe("observed");
    expect(result.actual.changes).toEqual([{ milestoneId: "m1", choiceEvidenceId: "choice-1", actualChange: "accepts help", sourceRefs: ["chapter://1"] }]);
  });
});
