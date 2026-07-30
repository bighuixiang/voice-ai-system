import { describe, expect, it } from "vitest";
import { evaluateCharacterAgency } from "./characterAgencyGuard.js";

const base = { eventId: "event-1", projectSlug: "demo", characterId: "hero", outcome: "ally escapes", sourceRefs: ["chapter://1"] };
describe("character agency guard", () => {
  it("passes when a key outcome has a cited character choice", () => {
    const result = evaluateCharacterAgency({ ...base, choiceEvidenceIds: ["choice-1"], causalFactors: [{ kind: "character-choice", description: "warned ally despite losing escape window", evidenceRefs: ["choice://1"] }] });
    expect(result.status).toBe("passed");
    expect(result.choiceEvidenceIds).toEqual(["choice-1"]);
  });

  it("blocks outcomes driven only by coincidence, external force, or antagonist error", () => {
    const result = evaluateCharacterAgency({ ...base, choiceEvidenceIds: [], causalFactors: [{ kind: "coincidence", description: "storm opened the gate", evidenceRefs: ["world://storm"] }, { kind: "antagonist-error", description: "guard forgot the key", evidenceRefs: ["scene://guard"] }] });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["AGENCY_CHOICE_MISSING", "AGENCY_EXTERNAL_SUBSTITUTION"]));
  });

  it("requires evidence on the choice factor and preserves repair guidance", () => {
    const result = evaluateCharacterAgency({ ...base, choiceEvidenceIds: ["choice-1"], causalFactors: [{ kind: "character-choice", description: "hero decides", evidenceRefs: [] }] });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContain("AGENCY_CHOICE_EVIDENCE_MISSING");
    expect(result.repair).toContain("credible options");
  });
});
