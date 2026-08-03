import { describe, expect, it } from "vitest";
import { proposeObjectiveCalibration } from "./objectiveCalibration.js";

describe("objective calibration", () => {
  it("asks one scoped calibration question instead of globally flipping strategy", () => {
    expect(proposeObjectiveCalibration({ observations: [{ scope: "scene-a", preference: "fast" }, { scope: "scene-b", preference: "detailed" }, { scope: "scene-c", preference: "fast" }] })).toMatchObject({ status: "calibration_required", question: "这些快/细偏好分别适用于哪些场景或阶段？" });
  });
});
