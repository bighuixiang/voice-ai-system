import { describe, expect, it } from "vitest";
import { compareReadModel, enforceCaptureConvergence, guardUnderstandingVersion, preserveAuthorUtterance, preserveSemanticDowngrade, publishJourneyProjection, resolveCaptureCrash, resolveControlCommand } from "./journeyProjectionGates.js";
describe("journey projection gates", () => {
  it("maps control language to deterministic events", () => { expect(resolveControlCommand({ state: "reviewable", command: "继续" })).toMatchObject({ event: "continue", available: true }); });
  it("keeps utterance trace when chat projection is rebuilt", () => { expect(preserveAuthorUtterance({ utteranceId: "u1", text: "idea", seedId: "s1", deletedProjection: true }).traceable).toBe(true); });
  it("reconciles conflicting read models", () => { expect(compareReadModel({ authoritative: "a", projection: "b", projectionVersion: "v1" }).primary).toBe("read-authority"); });
  it("preserves semantic events during downgrade", () => { expect(preserveSemanticDowngrade({ utteranceEvents: 1, legacyCompatible: false, loss: ["tone"] }).readOnly).toBe(true); });
  it("recovers crash at a single capture boundary", () => { expect(resolveCaptureCrash({ project: true, utterance: true, cursor: false, projection: false })).toMatchObject({ state: "retryable", exactlyOnce: false }); });
  it("forces all writable entrances through capture command", () => { expect(enforceCaptureConvergence({ entryPoints: [{ writesUtterance: true, callsModel: false, idempotency: true }, { writesUtterance: true, callsModel: true, idempotency: true }] }).valid).toBe(false); });
  it("publishes one journey primary action with source version", () => { expect(publishJourneyProjection({ sourceVersion: "v2", actions: ["capture"] })).toMatchObject({ primary: "capture", sourceVersion: "v2" }); });
  it("stales late understanding results after correction", () => { expect(guardUnderstandingVersion({ frozenFingerprint: "v3", currentFingerprint: "v4" }).status).toBe("stale"); });
});
