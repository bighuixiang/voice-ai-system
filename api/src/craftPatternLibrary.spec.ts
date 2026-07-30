import { describe, expect, it } from "vitest";
import { createCraftPattern, validateCraftPattern } from "./craftPatternLibrary.js";

const valid = { patternId: "desire-obstacle-choice", name: "desire-obstacle-choice-cost", category: "choice-cost" as const, purpose: "turn pressure into an irreversible choice", observableMoves: ["state desire", "apply resistance", "show choice", "show cost", "show aftermath"], transferContexts: ["dialogue", "combat", "daily-life"], forbiddenImitationFeatures: ["specific character names", "signature phrases"], sourceRefs: ["review://pattern-1"] };

describe("craft pattern library", () => {
  it("stores explainable transferable craft rather than surface imitation", () => {
    const pattern = createCraftPattern(valid);
    expect(pattern.status).toBe("active");
    expect(validateCraftPattern(pattern).status).toBe("usable");
  });

  it("blocks a pattern without observable moves or anti-imitation boundaries", () => {
    expect(() => createCraftPattern({ ...valid, observableMoves: [] })).toThrow("CRAFT_PATTERN_MOVES_REQUIRED");
    expect(() => createCraftPattern({ ...valid, forbiddenImitationFeatures: [] })).toThrow("CRAFT_PATTERN_ANTI_IMITATION_REQUIRED");
  });

  it("requires independent source provenance", () => {
    expect(() => createCraftPattern({ ...valid, sourceRefs: [] })).toThrow("CRAFT_PATTERN_SOURCE_REQUIRED");
  });
});
