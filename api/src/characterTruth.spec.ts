import { describe, expect, it } from "vitest";
import { resolveCharacterFieldTruth } from "./characterTruth.js";

const observation = (value: string, provenance: "author-confirmed" | "canon-fact" | "character-self-report" | "other-view" | "plan" | "inference" | "unknown", sourceVersion = provenance) => ({ value, provenance, sourceVersion, evidenceRefs: [`${provenance}://1`] });
describe("character field truth", () => {
  it("keeps provenance and permits canon only from confirmed facts", () => {
    const result = resolveCharacterFieldTruth("falseBelief", [observation("trust is weakness", "author-confirmed"), observation("trust is weakness", "inference")]);
    expect(result.status).toBe("confirmed");
    expect(result.canonValue).toBe("trust is weakness");
    expect(result.assertions).toHaveLength(2);
  });

  it("preserves contradictory records instead of latest-file overwrite", () => {
    const result = resolveCharacterFieldTruth("woundOrFear", [observation("abandonment", "canon-fact", "chapter-2"), observation("public shame", "other-view", "chapter-3")]);
    expect(result.status).toBe("conflicted");
    expect(result.canonValue).toBeUndefined();
    expect(result.conflictValues).toEqual(["abandonment", "public shame"]);
  });

  it("does not promote unconfirmed inference into canon", () => {
    const result = resolveCharacterFieldTruth("internalNeed", [observation("needs trust", "inference"), observation("unknown", "unknown")]);
    expect(result.status).toBe("unknown");
    expect(result.canonValue).toBeUndefined();
    expect(result.issues).toContain("UNCONFIRMED_PSYCHOLOGY_NOT_CANON");
  });
});
