import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSteeringEvent, readSteeringEvent } from "./steeringEvent.js";

describe("steering event integrity", () => {
  it("rejects a tampered persisted direction before it can advance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "steering-event-"));
    const event = await createSteeringEvent({ root, projectSlug: "demo", runId: "run-1", direction: "raise the cost", parentRunVersion: 1 });
    const target = path.join(root, "sessions", "steering-events", `${event.eventId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.direction = "rewrite the whole book";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readSteeringEvent(root, event.eventId)).rejects.toThrow("STEERING_EVENT_INTEGRITY_FAILED");
  });
});
