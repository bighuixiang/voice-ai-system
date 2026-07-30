import { describe, expect, it } from "vitest";
import { resolveCraftConflicts } from "./craftConflict.js";

const base = { taskId: "task-1", sceneId: "scene-1", sourceRefs: ["contract://1"] };
describe("craft conflict resolution", () => {
  it("prioritizes hard constraints over aesthetic patterns and emits red-blue plans", () => {
    const result = resolveCraftConflicts({ ...base, rules: [
      { ruleId: "pattern", kind: "global-pattern", scope: "global", target: "reveal", directive: "allow", statement: "reveal early", sourceRefs: [] },
      { ruleId: "guard", kind: "hard-constraint", scope: "scene", target: "reveal", directive: "deny", statement: "protect secret", sourceRefs: [] }
    ] });
    expect(result.status).toBe("ready");
    expect(result.selectedRuleIds).toContain("guard");
    expect(result.rejectedRuleIds).toContain("pattern");
    expect(result.red.ruleIds).toContain("pattern");
    expect(result.blue.ruleIds).toContain("guard");
  });
  it("blocks unresolved hard-constraint conflicts instead of composing both directives", () => {
    const result = resolveCraftConflicts({ ...base, rules: [
      { ruleId: "h1", kind: "hard-constraint", scope: "scene", target: "action", directive: "allow", statement: "allow", sourceRefs: [] },
      { ruleId: "h2", kind: "hard-constraint", scope: "scene", target: "action", directive: "deny", statement: "deny", sourceRefs: [] }
    ] });
    expect(result.status).toBe("blocked");
    expect(result.promptDirectives).toHaveLength(1);
    expect(result.conflicts[0]?.ruleIds).toEqual(["h1", "h2"]);
  });
});
