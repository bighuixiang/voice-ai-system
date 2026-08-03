import { describe, expect, it } from "vitest";
import { evaluateObjectiveEvidence } from "./objectiveEvidence.js";

describe("objective evidence anti-gaming", () => {
  it("accepts mixed evidence with explicit evidence types", () => {
    const result = evaluateObjectiveEvidence({ objectiveId: "voice", objectiveKind: "aesthetic", evidence: [
      { type: "prose-anchor", ref: "scene-4", description: "voice holds under pressure" },
      { type: "human-judgment", ref: "review-2", description: "blind reviewer agrees" },
    ] });
    expect(result.status).toBe("supported");
    expect(result.evidenceTypes).toEqual(["prose-anchor", "human-judgment"]);
  });

  it("blocks proxy metrics posing as an aesthetic objective", () => {
    const result = evaluateObjectiveEvidence({ objectiveId: "voice", objectiveKind: "aesthetic", evidence: [
      { type: "proxy-metric", ref: "metric-1", description: "keyword frequency 8%", metric: "keyword-frequency", score: 0.8 },
    ] });
    expect(result).toMatchObject({ status: "blocked", reason: "METRIC_GAMING_RISK" });
  });

  it("does not allow a single evaluator score to stand alone", () => {
    const result = evaluateObjectiveEvidence({ objectiveId: "tension", objectiveKind: "aesthetic", evidence: [
      { type: "proxy-metric", ref: "judge-1", description: "judge score", metric: "single-evaluator-score", score: 0.9 },
      { type: "hard-fact", ref: "fact-1", description: "deadline met" },
    ] });
    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("METRIC_GAMING_RISK");
  });
});
