import { describe, expect, it } from "vitest";
import { analyzeCharacterRevisionImpact } from "./characterRevisionImpact.js";

const base = { revisionId: "rev-1", projectSlug: "demo", characterId: "hero", changedFields: ["falseBelief"], oldValues: { falseBelief: "trust is weakness" }, newValues: { falseBelief: "control prevents abandonment" }, sourceRefs: ["author://revision-1"], dependencies: [
  { dependencyId: "arc-1", kind: "arc" as const, characterId: "hero", references: ["falseBelief"], status: "current" as const },
  { dependencyId: "relationship-1", kind: "relationship" as const, characterId: "hero", references: ["trust"], status: "current" as const },
  { dependencyId: "chapter-1", kind: "chapter" as const, characterId: "other", references: ["falseBelief"], status: "current" as const }
] };
describe("character revision impact", () => {
  it("marks only directly dependent artifacts stale and proposes minimal replanning", () => {
    const result = analyzeCharacterRevisionImpact(base);
    expect(result.staleDependencyIds).toEqual(["arc-1"]);
    expect(result.unchangedDependencyIds).toEqual(["relationship-1", "chapter-1"]);
    expect(result.minimumActions).toContain("revalidate arc-1");
  });

  it("requires before/after values and evidence for a revision", () => {
    expect(() => analyzeCharacterRevisionImpact({ ...base, sourceRefs: [], newValues: {} })).toThrow("CHARACTER_REVISION_EVIDENCE_REQUIRED");
  });

  it("does not silently replan unrelated projects or characters", () => {
    const result = analyzeCharacterRevisionImpact({ ...base, dependencies: [{ dependencyId: "other-project", kind: "arc", characterId: "hero", references: ["falseBelief"], status: "current", projectSlug: "other" }] });
    expect(result.staleDependencyIds).toEqual([]);
    expect(result.issues).toContain("CROSS_SCOPE_DEPENDENCY_IGNORED");
  });

  it("propagates a character change across every character-dependent product surface", () => {
    const dependencyKinds = ["outline", "prose", "knowledge", "presence", "reader-experience", "ending"] as const;
    const result = analyzeCharacterRevisionImpact({ ...base, dependencies: dependencyKinds.map((kind, index) => ({ dependencyId: `${kind}-${index}`, kind, characterId: "hero", references: ["falseBelief"], status: "current" as const })) });
    expect(result.staleDependencyIds).toHaveLength(dependencyKinds.length);
    expect(result.minimumActions).toHaveLength(dependencyKinds.length);
  });
});
