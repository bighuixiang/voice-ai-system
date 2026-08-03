import { describe, expect, it } from "vitest";
import { projectInferenceSafety } from "./inferenceSafety.js";

describe("inference safety", () => {
  it("keeps inferred genre and atmosphere out of confirmed contract fields", () => {
    const result = projectInferenceSafety({ fields: [
      { fieldId: "premise", text: "废土上最后一座图书馆", kind: "fact", source: "user", evidenceRefs: ["utterance://u1#0-10"] },
      { fieldId: "genre", text: "末世废土题材", kind: "inference", source: "system-inference", evidenceRefs: ["inference://genre/1"] },
      { fieldId: "year", text: "末世年份未知", kind: "unknown", source: "system-inference", evidenceRefs: ["unknown://year/1"] }
    ] });
    expect(result.canonEligibleFieldIds).toEqual(["premise"]);
    expect(result.fields.find((item) => item.fieldId === "genre")).toMatchObject({ epistemic: "inferred", contractEligible: false });
    expect(result.fields.find((item) => item.fieldId === "year")).toMatchObject({ epistemic: "provisional", contractEligible: false });
  });
  it("rejects a system inference disguised as an author fact", () => {
    expect(() => projectInferenceSafety({ fields: [{ fieldId: "job", text: "主角是拾荒者", kind: "fact", source: "system-inference", evidenceRefs: ["inference://job/1"] }] })).toThrow("INFERENCE_FACT_SOURCE_INVALID");
  });
});
