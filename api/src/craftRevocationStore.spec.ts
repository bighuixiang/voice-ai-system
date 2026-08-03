import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { propagateCraftSourceRevocation } from "./craftRevocationPropagation.js";
import { persistCraftRevocationRecord, readCraftRevocationRecord } from "./craftRevocationStore.js";

describe("craft revocation record", () => {
  it("persists a project-scoped source revocation and replays it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-revocation-"));
    const propagation = propagateCraftSourceRevocation({ sourceId: "source-1", eventId: "revoke-1", sourceFingerprint: "source-fp", reason: "license withdrawn", evidenceRefs: ["evidence://withdrawal"], sourceRefs: ["source://source-1"], artifacts: [{ artifactId: "pattern-1", kind: "pattern", sourceIds: ["source-1"], status: "active" }, { artifactId: "prose-1", kind: "published-prose", sourceIds: ["source-1"], status: "published" }] });
    const saved = await persistCraftRevocationRecord(root, { projectSlug: "project-a", propagation });
    expect(saved).toMatchObject({ projectSlug: "project-a", propagation: { derivativeDisposition: "invalidated", invalidatedArtifactIds: ["pattern-1"], retainedHistoricalArtifactIds: ["prose-1"] } });
    expect(await readCraftRevocationRecord(root, "revoke-1")).toMatchObject({ fingerprint: saved.fingerprint, projectSlug: "project-a" });
    expect(await persistCraftRevocationRecord(root, { projectSlug: "project-a", propagation })).toEqual(saved);
    await expect(persistCraftRevocationRecord(root, { projectSlug: "project-b", propagation })).rejects.toThrow("CRAFT_REVOCATION_PROJECT_MISMATCH");
  });
});
