import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCreativeJourneyProjection } from "./creativeJourney.js";
import { persistCreativeJourneyProjection, readCreativeJourneyProjection } from "./creativeJourneyStore.js";
import type { CreativeSession } from "./creativeSession.js";

function session(): CreativeSession {
  return {
    schemaVersion: "creative-session.v1", sessionId: "session-demo", projectSlug: "demo", status: "capturing", phase: "capture", collaborationMode: "guided",
    latestDirection: "", unconfirmedAssumptions: [], decisionRefs: [], pendingPatchRefs: [], messages: [],
    createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "f".repeat(64)
  };
}

describe("creative journey projection persistence", () => {
  it("persists and restores the projection with its source fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "creative-journey-store-"));
    const projection = buildCreativeJourneyProjection(session());
    await persistCreativeJourneyProjection(root, projection);
    await expect(readCreativeJourneyProjection(root, "demo")).resolves.toEqual(projection);
  });

  it("rejects a tampered persisted projection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "creative-journey-store-"));
    const projection = buildCreativeJourneyProjection(session());
    await persistCreativeJourneyProjection(root, projection);
    const target = path.join(root, "sessions/creative-journey-projection.json");
    const tampered = { ...projection, projectSlug: "other" };
    await fs.writeFile(target, `${JSON.stringify(tampered)}\n`, "utf8");
    await expect(readCreativeJourneyProjection(root, "demo")).rejects.toThrow("CREATIVE_JOURNEY_PROJECTION_INTEGRITY_FAILED");
  });
});
