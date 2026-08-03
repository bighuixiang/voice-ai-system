import { describe, expect, it } from "vitest";
import { compareSourceScope, planResearch, propagateSourceCorrection, quarantineSource } from "./researchGovernanceGates.js";
describe("research governance gates", () => {
  it("creates high-risk research plan with one material question", () => { expect(planResearch({ topics: ["procedure", "dosage"], highRisk: ["medical"], budget: 10, stopConditions: ["two sources"] }).questions).toBe(1); });
  it("quarantines untrusted and prompt-injected sources", () => { expect(quarantineSource({ locatable: true, rightsKnown: true, promptInjection: true })).toMatchObject({ status: "prompt-isolated", executeInstructions: false, claimSupported: false }); });
  it("keeps source families and scope disputes visible", () => { expect(compareSourceScope({ sources: [{ family: "news", effective: "2020", region: "A", claim: "10" }, { family: "news", effective: "2020", region: "A", claim: "10" }, { family: "official", effective: "2018", region: "B", claim: "12" }] })).toMatchObject({ families: ["news", "official"], disputed: true }); });
  it("invalidates only consumed story ranges after correction", () => { expect(propagateSourceCorrection({ consumedSpans: ["s1"], dependentScenes: ["ch8", "ch10"], unrelatedScenes: ["ch2"], corrected: true, adopted: false })).toMatchObject({ stale: ["s1", "ch8", "ch10"], protectedScenes: ["ch2"], settlement: false }); });
});
