import { describe, expect, it } from "vitest";
import { createCharacterPresencePlan, evaluateCharacterPresence } from "./characterPresence.js";

const plan = { planId: "presence-1", projectSlug: "demo", characterId: "ally", arcRefs: ["arc://ally"], relationshipRefs: ["relationship://hero-ally"], obligationRefs: ["obligation://medicine"], resourceDependencies: ["resource://smuggler"], sceneCapacity: 2, entries: [
  { sceneId: "scene-1", mode: "present" as const, function: "deliver warning", expectedContribution: "reveals route risk", dependencyRefs: ["obligation://medicine"] },
  { sceneId: "scene-2", mode: "absent" as const, function: "off-page" as const, expectedContribution: "pursues medicine", dependencyRefs: ["resource://smuggler"] },
  { sceneId: "scene-3", mode: "return" as const, function: "account for absence", expectedContribution: "returns with cost", dependencyRefs: ["resource://smuggler"] }
], sourceRefs: ["plan://presence"] };
describe("character presence plan", () => {
  it("plans presence by scene function and dependencies", () => {
    const result = createCharacterPresencePlan(plan);
    expect(result.entries[1].mode).toBe("absent");
    expect(result.status).toBe("planned");
  });

  it("reports functional overuse and missing required nodes without equating absence to dropout", () => {
    const result = evaluateCharacterPresence(createCharacterPresencePlan(plan), { observed: [{ sceneId: "scene-1", function: "", contribution: "" }, { sceneId: "scene-3", function: "account for absence", contribution: "returns" }], requiredSceneIds: ["scene-1", "scene-3"] });
    expect(result.issues).toEqual(expect.arrayContaining(["PRESENCE_FUNCTION_MISSING"]));
    expect(result.dropoutAssumption).toBe(false);
  });

  it("flags a frequently named but functionless appearance as a separate issue", () => {
    const result = evaluateCharacterPresence(createCharacterPresencePlan(plan), { observed: [{ sceneId: "scene-1", function: "", contribution: "" }, { sceneId: "scene-4", function: "", contribution: "" }], requiredSceneIds: [] });
    expect(result.issues).toContain("PRESENCE_FUNCTIONLESS_APPEARANCE");
  });
});
