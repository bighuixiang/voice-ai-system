import { describe, expect, it } from "vitest";
import { createRelationshipMisread, resolveRelationshipMisread } from "./relationshipMisread.js";

const base = { relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", sourceDefinition: "ally is useful but dangerous", targetDefinition: "hero finally trusts me", publicState: "allied", sourceSecret: "plans to leave", targetSecret: "withholds debt", misunderstanding: "both think the other accepted the bargain", sourceRefs: ["scene://1"] };
describe("relationship asymmetry and misread", () => {
  it("preserves directional definitions instead of mirroring trust", () => {
    const result = createRelationshipMisread(base);
    expect(result.sourceDefinition).not.toBe(result.targetDefinition);
    expect(result.status).toBe("unresolved");
  });

  it("updates knowledge on clarification without restoring relationship automatically", () => {
    const result = resolveRelationshipMisread(createRelationshipMisread(base), { sourceInterpretation: "ally may be honest", targetInterpretation: "hero still owes repair", evidenceRefs: ["scene://2"], compensationProvided: false });
    expect(result.status).toBe("clarified-unrepaired");
    expect(result.relationshipRestored).toBe(false);
    expect(result.targetInterpretation).toContain("repair");
  });

  it("requires explicit compensation before marking the relationship repaired", () => {
    const result = resolveRelationshipMisread(createRelationshipMisread(base), { sourceInterpretation: "trust can be rebuilt", targetInterpretation: "debt is repaid", evidenceRefs: ["scene://3"], compensationProvided: true });
    expect(result.status).toBe("repaired");
    expect(result.relationshipRestored).toBe(true);
  });
});
