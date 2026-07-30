import { describe, expect, it } from "vitest";
import { diffCharacterStateSnapshots } from "./characterStateDiff.js";

const snapshot = (overrides: Record<string, unknown> = {}) => ({ snapshotId: "s1", projectSlug: "demo", characterId: "hero", contractId: "contract-1", asOf: "chapter-1", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: ["gate"], emotion: "fear", injury: "none", resources: ["key"], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: ["warn"], availableChoices: ["flee"], sourceRefs: ["chapter://1"], ...overrides });
describe("character state diff", () => {
  it("reports multidimensional changes with both snapshot evidence refs", () => {
    const result = diffCharacterStateSnapshots(snapshot(), snapshot({ snapshotId: "s2", asOf: "chapter-2", belief: "ally may help", emotion: "resolve", resources: ["key", "map"], sourceRefs: ["chapter://2"] }));
    expect(result.changedDimensions).toEqual(expect.arrayContaining(["belief", "emotion", "resources"]));
    expect(result.sourceRefs).toEqual(["chapter://1", "chapter://2"]);
  });

  it("rejects diffs across different characters or contracts", () => {
    expect(() => diffCharacterStateSnapshots(snapshot(), snapshot({ characterId: "other" }))).toThrow("CHARACTER_STATE_SCOPE_MISMATCH");
  });
});
