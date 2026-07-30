import { describe, expect, it } from "vitest";
import { classifyCharacterDocument, registerCharacterIdentity, admitCharacterToCast } from "./characterIdentity.js";

const identity = { projectSlug: "demo", entityId: "char-1", displayName: "Mira", aliases: ["Mira", "The Cartographer"], narrativeIdentity: "reluctant cartographer", sourceRefs: ["canon://characters/1"] };
describe("character identity and document classification", () => {
  it("admits only stable sourced entities into the character cast", () => {
    const entity = registerCharacterIdentity(identity);
    expect(admitCharacterToCast(entity).status).toBe("admitted");
    expect(entity.entityId).toBe("char-1");
  });

  it("keeps handbooks, covers, chapters, and relationship plans as source assets", () => {
    for (const category of ["character-handbook", "cover-plan", "chapter", "relationship-plan"] as const) {
      const result = classifyCharacterDocument({ path: `docs/${category}/mira.md`, title: "Mira character", category, sourceRefs: ["doc://1"] });
      expect(result.isCharacterNode).toBe(false);
      expect(result.kind).toBe("source-asset");
    }
  });

  it("does not let a path or title fabricate a character identity", () => {
    expect(() => classifyCharacterDocument({ path: "characters/fake.md", title: "Character: Unknown", category: "unknown", sourceRefs: [] })).toThrow("CHARACTER_DOCUMENT_SOURCE_REQUIRED");
    expect(() => admitCharacterToCast({ entityId: "", displayName: "Fake", aliases: [], narrativeIdentity: "", sourceRefs: [] })).toThrow("CHARACTER_IDENTITY_INVALID");
  });
});
