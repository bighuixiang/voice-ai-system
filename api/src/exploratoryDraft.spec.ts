import { describe, expect, it } from "vitest";
import { createExploratoryDraft } from "./exploratoryDraft.js";

describe("exploratory draft", () => {
  it("cannot silently become canon", () => {
    const draft = createExploratoryDraft({ draftId: "d-1", text: "A candidate scene", sourceRefs: ["intent-1"] });
    expect(draft.status).toBe("candidate");
    expect(draft.isCanon).toBe(false);
    expect(draft.adoptionRequired).toBe(true);
  });

  it("requires provenance before an exploratory candidate can be shown", () => {
    expect(() => createExploratoryDraft({ draftId: "d-2", text: "Untraceable candidate", sourceRefs: [] })).toThrow("EXPLORATORY_DRAFT_SOURCE_REQUIRED");
  });
});
