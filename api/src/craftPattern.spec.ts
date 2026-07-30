import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createCraftPattern, readCraftPattern } from "./craftPattern.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "craft-pattern-")); }
const input = (root: string) => ({ root, projectSlug: "demo", name: "delayed reveal", applicableScenes: ["investigation"], structuralMechanism: "plant a concrete discrepancy before the reveal", readerEffect: "fair surprise", minimalPositiveExample: "a missing seal is noticed", counterExample: "secret appears without setup", failureConditions: ["no causal clue"], genreBoundaries: ["mystery"], sourceRecordId: "source-1", sourceRefs: ["source://1"] });
describe("explainable craft pattern", () => {
  it("stores mechanism, effects, examples, boundaries and provenance", async () => { const pattern = await createCraftPattern(input(await root())); expect(pattern.status).toBe("candidate"); expect(pattern.structuralMechanism).toContain("discrepancy"); });
  it("rejects author imitation and long source reproduction", async () => { const r = await root(); await expect(createCraftPattern({ ...input(r), name: "像某作者一样写" })).rejects.toThrow("CRAFT_AUTHOR_IMPERSONATION_FORBIDDEN"); await expect(createCraftPattern({ ...input(r), minimalPositiveExample: "x".repeat(1001) })).rejects.toThrow("CRAFT_EXAMPLE_TOO_LONG"); });
  it("is idempotent and requires all explanatory fields", async () => { const r = await root(); const one = await createCraftPattern(input(r)); const two = await createCraftPattern({ ...input(r), readerEffect: "changed" }); expect(two.fingerprint).toBe(one.fingerprint); await expect(createCraftPattern({ ...input(r), sourceRefs: [] })).rejects.toThrow("CRAFT_SOURCE_REQUIRED"); expect(await readCraftPattern(r, one.patternId)).toEqual(one); });
});
