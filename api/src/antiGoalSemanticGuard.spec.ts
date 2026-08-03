import { describe, expect, it } from "vitest";
import { detectAbstractAntiGoal } from "./antiGoalSemanticGuard.js";

describe("anti-goal semantic guard", () => {
  it("catches a synonym rewrite of the rejected fate-wheel template", () => {
    expect(detectAbstractAntiGoal({ text: "无人知晓，风暴已然逼近", antiGoal: "命运齿轮模板钩子", evidenceRef: "author://reject-1" })).toMatchObject({ status: "repair-required", matched: true });
  });
});
