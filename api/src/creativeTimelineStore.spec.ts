import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCreativeTimelineProjection } from "./creativeTimeline.js";
import { persistCreativeTimelineProjection, readCreativeTimelineProjection } from "./creativeTimelineStore.js";
import type { CreativeSession } from "./creativeSession.js";

const session: CreativeSession = { schemaVersion: "creative-session.v1", sessionId: "session-demo", projectSlug: "demo", status: "capturing", phase: "capture", collaborationMode: "guided", latestDirection: "", unconfirmedAssumptions: [], decisionRefs: [], pendingPatchRefs: [], messages: [], createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "f".repeat(64) };

describe("creative timeline persistence", () => {
  it("round-trips a timeline projection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "creative-timeline-store-"));
    const timeline = buildCreativeTimelineProjection(session);
    await persistCreativeTimelineProjection(root, timeline);
    await expect(readCreativeTimelineProjection(root, "demo")).resolves.toEqual(timeline);
  });
});
