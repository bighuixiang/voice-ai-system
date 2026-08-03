import { describe, expect, it } from "vitest";
import { buildPurposeManifest, enforceK4, guardLateUnderstanding, recoverUnderstandingTask, replayContextManifest, validateT0Coverage, validateUnderstandingEvidence } from "./understandingGates.js";
describe("understanding gates", () => {
  it("rejects late understanding result after correction", () => { expect(guardLateUnderstanding({ frozen: "v3", current: "v4" })).toMatchObject({ status: "stale", canWrite: false }); });
  it("resumes cancellation or crash on same task without duplicate write", () => { expect(recoverUnderstandingTask({ taskId: "t1", cancelled: true, crashed: false, frozenInput: "u1", callFingerprint: "c1" })).toMatchObject({ status: "resume", duplicateWrite: false }); });
  it("blocks T0 assembly when corrections or negatives are dropped", () => { expect(validateT0Coverage({ totalChars: 100, capturedChars: 80, negativeSpans: 0, correctionSpans: 1 }).blocked).toBe(true); });
  it("builds query-purpose context manifest with exclusions", () => { expect(buildPurposeManifest({ purpose: "protagonist", selected: ["p1"], excluded: [{ id: "ending", reason: "revoked" }], revokedExcluded: true }).excluded[0].reason).toBe("revoked"); });
  it("marks changed source manifest stale on replay", () => { expect(replayContextManifest({ manifestFingerprint: "m1", sourceFingerprint: "s2", replayFingerprint: "m1" }).status).toBe("stale"); });
  it("rejects model claim without confirmed cited evidence", () => { expect(validateUnderstandingEvidence({ claim: "confirmed tragic", confirmedSources: ["p1"], citedSources: ["p2"], sourceVersionChanged: false }).status).toBe("conflicted"); });
  it("blocks first RP2 call when any K4 dependency is missing", () => { expect(enforceK4({ riskProfile: true, modelPermission: true, manifest: false, t0: true, budget: true, callFingerprint: true, privacy: true })).toMatchObject({ allowed: false, modelCalls: 0, writes: 0 }); });
});
