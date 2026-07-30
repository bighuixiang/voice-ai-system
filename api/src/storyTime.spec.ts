import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStoryTimeEvent, compareStoryTime, listStoryTimeEvents, readStoryTimeEvent } from "./storyTime.js";

const input = (root: string, eventId = "siege-start") => ({ root, projectSlug: "demo", eventId, label: "siege starts", timelineId: "main", start: "day-010", end: "day-010", duration: "1 day", category: "event" as const, uncertainty: "exact", parallelLine: "north-front", sourceRefs: ["chapter://1#event"] });

describe("story time event", () => {
  it("stores comparable time independent of chapter ordering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-time-"));
    const event = await createStoryTimeEvent(input(root));
    expect(event.schemaVersion).toBe("story-time-event.v1");
    expect(event.timelineId).toBe("main");
    expect(event.category).toBe("event");
    expect(await readStoryTimeEvent(root, event.eventId)).toEqual(event);
  });

  it("is idempotent and compares ordered, simultaneous, and unknown times", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-time-"));
    const first = await createStoryTimeEvent(input(root));
    expect(await createStoryTimeEvent(input(root))).toEqual(first);
    const later = await createStoryTimeEvent({ ...input(root, "siege-end"), start: "day-012", end: "day-013", duration: "2 days" });
    const parallel = await createStoryTimeEvent({ ...input(root, "south-letter"), timelineId: "parallel", start: "day-010", end: "day-010" });
    const unknown = await createStoryTimeEvent({ ...input(root, "unknown"), start: "", end: "", uncertainty: "unknown" });
    expect(compareStoryTime(first, later)).toBe("before");
    expect(compareStoryTime(first, parallel)).toBe("simultaneous");
    expect(compareStoryTime(first, unknown)).toBe("unknown");
    expect(await listStoryTimeEvents(root, "demo")).toHaveLength(4);
  });

  it("requires source refs and valid time declarations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-time-"));
    await expect(createStoryTimeEvent({ ...input(root), sourceRefs: [] })).rejects.toThrow("STORY_TIME_SOURCE_REQUIRED");
    await expect(createStoryTimeEvent({ ...input(root), end: "day-009" })).rejects.toThrow("STORY_TIME_RANGE_INVALID");
  });

  it("accepts comparable operational categories without using chapter order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-time-"));
    const training = await createStoryTimeEvent({ ...input(root, "training"), category: "training", start: "day-005", end: "day-008", duration: "4 days" });
    const cooldown = await createStoryTimeEvent({ ...input(root, "cooldown"), category: "cooldown", start: "day-009", end: "day-010", duration: "2 days" });
    expect(training.category).toBe("training");
    expect(compareStoryTime(training, cooldown)).toBe("before");
  });
});
