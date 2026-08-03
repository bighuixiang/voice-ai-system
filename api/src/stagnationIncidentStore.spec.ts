import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectStagnation } from "./stagnationDetection.js";
import { persistStagnationIncident, readStagnationIncident } from "./stagnationIncidentStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("stagnation incident store", () => {
  it("persists an incident with project/run binding and replays idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "stagnation-store-")); roots.push(root);
    const incident = detectStagnation({ workFingerprints: ["same", "same", "same"], rewriteCount: 3, questionFingerprints: [], qualityScores: [], newAssetCount: 0, completionSignals: 0, openObligations: 0 });
    const first = await persistStagnationIncident(root, { incidentId: "incident-1", projectSlug: "demo", bookRunId: "book-run-1", incident });
    const replay = await persistStagnationIncident(root, { incidentId: "incident-1", projectSlug: "demo", bookRunId: "book-run-1", incident });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.record.fingerprint).toBe(first.record.fingerprint);
    await expect(readStagnationIncident(root, "incident-1")).resolves.toMatchObject({ projectSlug: "demo", bookRunId: "book-run-1", incident: { status: "paused" } });
  });

  it("rejects a replay with a different project or run binding", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "stagnation-store-scope-")); roots.push(root);
    const incident = detectStagnation({ workFingerprints: ["a", "b"], rewriteCount: 0, questionFingerprints: [], qualityScores: [], newAssetCount: 2, completionSignals: 0, openObligations: 0 });
    await persistStagnationIncident(root, { incidentId: "incident-1", projectSlug: "demo", bookRunId: "book-run-1", incident });
    await expect(persistStagnationIncident(root, { incidentId: "incident-1", projectSlug: "other", bookRunId: "book-run-1", incident })).rejects.toThrow("STAGNATION_INCIDENT_SCOPE_CONFLICT");
  });
});
