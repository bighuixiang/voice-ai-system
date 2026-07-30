import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listWorldStateSnapshots, readWorldStateSnapshot, recordWorldStateSnapshot } from "./worldState.js";

const input = (root: string, region = "north") => ({ root, projectSlug: "demo", asOf: "chapter-001:end", region, publicationVersion: "canon-1", politicalControl: ["council"], activeConflicts: ["border siege"], institutions: ["watch"], infrastructure: ["gate"], markets: ["grain"], environment: ["winter"], resources: ["water"], effectiveRuleIds: ["rule-1"], unknowns: ["southern roads"], sourceRefs: ["chapter://1#end"] });

describe("world state snapshot", () => {
  it("stores regional, temporal state without globalizing unknowns", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-state-"));
    const snapshot = await recordWorldStateSnapshot(input(root));
    expect(snapshot.schemaVersion).toBe("world-state-snapshot.v1");
    expect(snapshot.region).toBe("north");
    expect(snapshot.unknowns).toContain("southern roads");
    expect(await readWorldStateSnapshot(root, snapshot.snapshotId)).toEqual(snapshot);
  });

  it("is idempotent and filters by project and region", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-state-"));
    const first = await recordWorldStateSnapshot(input(root));
    expect(await recordWorldStateSnapshot(input(root))).toEqual(first);
    expect(await listWorldStateSnapshots(root, "other")).toEqual([]);
    expect(await listWorldStateSnapshots(root, "demo", "south")).toEqual([]);
    expect(await listWorldStateSnapshots(root, "demo", "north")).toHaveLength(1);
  });

  it("requires source references and unknown declaration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-state-"));
    await expect(recordWorldStateSnapshot({ ...input(root), sourceRefs: [] })).rejects.toThrow("WORLD_STATE_SOURCE_REQUIRED");
    await expect(recordWorldStateSnapshot({ ...input(root), unknowns: [] })).rejects.toThrow("WORLD_STATE_UNKNOWN_REQUIRED");
  });
});
