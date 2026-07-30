import { describe, expect, it } from "vitest";
import { evaluatePovKnowledgeGate } from "./povKnowledgeGate.js";

const valid = { gateId: "pov-1", sceneId: "scene-1", povCharacterId: "hero", narrativeDistance: "close-third" as const, knownFacts: ["the gate is locked"], unknownFacts: ["the captain betrayed us"], misbeliefs: ["ally is safe"], claims: [{ text: "The gate felt cold under his hand.", kind: "observed" as const, evidenceRefs: ["scene://1#gate"] }, { text: "He believed the ally was safe.", kind: "pov-belief" as const, evidenceRefs: ["state://hero#belief"] }], sourceRefs: ["scene://1"] };

describe("POV knowledge gate", () => {
  it("passes observable and POV-belief claims within the declared distance", () => {
    const result = evaluatePovKnowledgeGate(valid);
    expect(result.status).toBe("passed");
    expect(result.violations).toEqual([]);
  });

  it("blocks unearned secrets, other minds, and distance jumps", () => {
    const result = evaluatePovKnowledgeGate({ ...valid, claims: [{ text: "The captain planned the betrayal.", kind: "secret" as const, evidenceRefs: [] }, { text: "The ally felt relieved.", kind: "other-mind" as const, evidenceRefs: [] }, { text: "The council knew everything.", kind: "omniscient" as const, evidenceRefs: [] }] });
    expect(result.status).toBe("blocked");
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["POV_SECRET_UNEARNED", "POV_OTHER_MIND_UNEARNED", "POV_DISTANCE_JUMP"]));
  });

  it("requires repair guidance for every violation", () => {
    const result = evaluatePovKnowledgeGate({ ...valid, claims: [{ text: "The captain betrayed us.", kind: "secret" as const, evidenceRefs: [] }] });
    expect(result.violations[0]?.repair).toBeTruthy();
  });
});
