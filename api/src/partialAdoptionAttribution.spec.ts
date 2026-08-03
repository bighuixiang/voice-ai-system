import { describe, expect, it } from "vitest";
import { attributePartialAdoption } from "./partialAdoptionAttribution.js";

describe("partial adoption attribution", () => {
  it("keeps plot evidence but does not promote unaccepted dialogue style", () => {
    expect(attributePartialAdoption({ candidateId: "cand-1", keptDimensions: ["plot-turn"], rejectedDimensions: ["dialogue", "voice"], authorRewrite: "作者重写的对白" })).toMatchObject({ status: "partial", structuralEvidence: ["plot-turn"], nonAdoptedEvidence: ["dialogue", "voice"], activePreferenceEligible: false });
  });
});
