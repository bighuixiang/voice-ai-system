import { describe, expect, it } from "vitest";
import { compileLegacyWorldMaterials } from "./worldLegacyCompiler.js";

const source = (path: string, content: string) => ({ path, content, sourceVersion: "v1" });
const valid = [source("bible/world.md", "## Rules\nFire needs oxygen."), source("bible/power-system.md", "## Abilities\nAnchor fold costs fatigue."), source("timeline/main.md", "day-1 gate opens"), source("story-control/story-control.json", '{"characters":[]}'), source("ledger/power-progression.md", "hero learns fold"), source("ledger/continuity.md", "gate remains sealed"), source("chapters/chapter-1.md", "The gate opens.")];

describe("legacy world compiler", () => {
  it("compiles candidates with source coverage and provenance", () => {
    const result = compileLegacyWorldMaterials(valid);
    expect(result.status).toBe("compiled");
    expect(result.scannedPaths).toHaveLength(7);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("reports missing required sources and unresolved regions as unhealthy", () => {
    const result = compileLegacyWorldMaterials([source("bible/world.md", "Rules\n[TRUNCATED]")]);
    expect(result.status).toBe("unhealthy");
    expect(result.unresolvedRegions).toEqual(expect.arrayContaining(["timeline", "story-control", "power-progression", "continuity", "prose"]));
  });

  it("preserves conflicts instead of picking a convenient canon", () => {
    const result = compileLegacyWorldMaterials([...valid, source("bible/world-v2.md", "Fire needs water.")]);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]?.status).toBe("unresolved");
  });
});
