import { describe, expect, it } from "vitest";
import { evaluateEnsembleAttention, recordEnsembleChapter } from "./ensembleAttention.js";

const chapter = { chapterId: "ch-1", projectSlug: "demo", sourceRefs: ["chapter://1"], characters: [
  { characterId: "hero", goal: "escape", choices: ["warn ally"], consequences: ["loses route"], attentionUnits: 8 },
  { characterId: "ally", goal: "secure medicine", choices: ["trade"], consequences: ["owes debt"], attentionUnits: 3 },
  { characterId: "rival", goal: "control bridge", choices: [], consequences: [], attentionUnits: 1 }
] };
describe("ensemble attention allocation", () => {
  it("records functional attention rather than dialogue frequency", () => {
    const result = recordEnsembleChapter(chapter);
    expect(result.characters.find((item) => item.characterId === "ally")?.choices).toContain("trade");
    expect(result.status).toBe("recorded");
  });

  it("reports long-term characters with no choices or consequences", () => {
    const result = evaluateEnsembleAttention([recordEnsembleChapter(chapter), recordEnsembleChapter({ ...chapter, chapterId: "ch-2", sourceRefs: ["chapter://2"], characters: chapter.characters.map((item) => item.characterId === "rival" ? { ...item, attentionUnits: 4 } : item) })], { minimumActiveChapters: 2 });
    expect(result.issues).toContain("ENSEMBLE_CHARACTER_NO_CHOICE_OR_CONSEQUENCE");
    expect(result.attribution.find((item) => item.characterId === "rival")?.status).toBe("tool-risk");
  });

  it("allows unequal attention when functional evidence explains the allocation", () => {
    const result = evaluateEnsembleAttention([recordEnsembleChapter(chapter)], { minimumActiveChapters: 2 });
    expect(result.unequalAttentionAllowed).toBe(true);
    expect(result.issues).not.toContain("ENSEMBLE_EQUAL_SHARE_REQUIRED");
  });
});
