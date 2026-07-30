import { describe, expect, it } from "vitest";
import { evaluateQuestionValue } from "./questionValueGate.js";

const valid = { questionId: "q-ending", text: "Does the hero sacrifice herself?", impact: 0.95, uncertainty: 0.8, irreversibility: 1, urgency: 0.8, userEffort: 0.1, affectedAssets: ["ending", "mainline"], recommendation: "keep the sacrifice", reversible: false, threshold: 0.2 };

describe("question value gate", () => {
  it("routes high-impact irreversible decisions to blocking L2", () => {
    const result = evaluateQuestionValue(valid);
    expect(result.level).toBe("L2");
    expect(result.blocking).toBe(true);
    expect(result.whyNow).toContain("ending");
  });

  it("routes reversible low-impact details to L0", () => {
    const result = evaluateQuestionValue({ ...valid, impact: 0.1, uncertainty: 0.2, irreversibility: 0.1, urgency: 0.1, userEffort: 0.2, affectedAssets: ["temporary-location"], reversible: true });
    expect(result.level).toBe("L0");
    expect(result.blocking).toBe(false);
  });

  it("rejects out-of-range inputs", () => {
    expect(() => evaluateQuestionValue({ ...valid, impact: 2 })).toThrow("QUESTION_GATE_VALUE_INVALID");
  });
});
