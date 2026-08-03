import { describe, expect, it } from "vitest";
import { resolveScopedObjective } from "./objectiveScopeOverride.js";

describe("objective scope override", () => {
  it("uses a funeral aftermath override only inside that chapter and restores base rhythm next chapter", () => {
    const override = { chapterId: "ch-funeral", preference: "留白和关系沉淀", reason: "aftermath" };
    expect(resolveScopedObjective({ basePreference: "节奏偏紧", chapterId: "ch-funeral", requestedChapterId: "ch-funeral", override })).toMatchObject({ preference: "留白和关系沉淀", source: "chapter-override", restored: false });
    expect(resolveScopedObjective({ basePreference: "节奏偏紧", chapterId: "ch-next", requestedChapterId: "ch-next", override })).toMatchObject({ preference: "节奏偏紧", source: "base", restored: true });
  });
});
