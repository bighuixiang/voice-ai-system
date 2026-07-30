import { describe, expect, it } from "vitest";
import { createCraftMechanismUnit } from "./craftMechanismUnit.js";

const valid = { unitId: "unit-1", triggerCondition: "角色必须在信息不完整时做选择", characterGoal: "保护同伴", narrativeFunction: "制造不可逆选择", readerExpectation: "期待代价兑现", actionChange: "角色改为隐瞒", informationChange: "读者确认规则但不知道幕后动机", cost: "信任下降", applicableScenes: ["moral-choice"], failureModes: ["选择没有后果"], evidenceRefs: ["prose://scene-1#mechanism"] };
describe("explainable craft mechanism unit", () => {
  it("stores executable mechanism fields", () => { const unit = createCraftMechanismUnit(valid); expect(unit.status).toBe("candidate"); expect(unit.actionChange).toContain("隐瞒"); });
  it("rejects surface-only pseudo rules", () => { expect(() => createCraftMechanismUnit({ ...valid, triggerCondition: "句子短", actionChange: "反转多", informationChange: "很有氛围" })).toThrow("CRAFT_MECHANISM_NOT_EXECUTABLE"); });
  it("requires failure mode, applicability and evidence", () => { expect(() => createCraftMechanismUnit({ ...valid, failureModes: [] })).toThrow("CRAFT_MECHANISM_FAILURE_REQUIRED"); expect(() => createCraftMechanismUnit({ ...valid, evidenceRefs: [] })).toThrow("CRAFT_MECHANISM_EVIDENCE_REQUIRED"); });
});
