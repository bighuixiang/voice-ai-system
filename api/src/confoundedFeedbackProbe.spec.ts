import { describe, expect, it } from "vitest";
import { createConfoundedFeedbackProbe } from "./confoundedFeedbackProbe.js";

describe("confounded feedback probe", () => {
  it("freezes plot and voice and probes only the changed POV", () => {
    expect(createConfoundedFeedbackProbe({ candidateId: "c-1", changedDimensions: ["plot", "pov", "voice"], authorRejected: true })).toMatchObject({ status: "confounded", frozenDimensions: ["plot", "voice"], probeDimension: "pov" });
  });
});
