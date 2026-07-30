import { describe, expect, it } from "vitest";
import { compileLegacySeedShadow, replaySeedCompilation, createStoryContractReadinessProof } from "./seedDurability.js";

describe("seed durability and readiness proof", () => {
  it("shadow-compiles legacy materials without changing canon", () => {
    const result = compileLegacySeedShadow({ projectId: "demo", materials: [{ source: "roughIdea", text: "A courier finds a door." }, { source: "publishedChapter", text: "The courier runs." }] });
    expect(result.mode).toBe("shadow");
    expect(result.changesCanon).toBe(false);
    expect(result.sourceRefs).toEqual(["roughIdea", "publishedChapter"]);
  });

  it("replays the same frozen compilation deterministically", () => {
    const one = replaySeedCompilation({ compilerVersion: "v1", inputFingerprint: "input-1", output: { facets: ["protagonist"] } });
    const two = replaySeedCompilation({ compilerVersion: "v1", inputFingerprint: "input-1", output: { facets: ["protagonist"] } });
    expect(one.outputFingerprint).toBe(two.outputFingerprint);
  });

  it("issues a bounded readiness proof instead of claiming the whole novel is solved", () => {
    const proof = createStoryContractReadinessProof({ target: "opening-structure", requiredFields: ["protagonist"], evidenceCovered: ["protagonist"], unresolved: ["ending"], provisionalAssumptions: ["pov"], authorAdopted: ["protagonist"], conflicts: [] });
    expect(proof.conclusion).toBe("sufficient-for-target");
    expect(proof.unresolved).toContain("ending");
    expect(proof.claimsWholeNovelSolved).toBe(false);
  });
});
