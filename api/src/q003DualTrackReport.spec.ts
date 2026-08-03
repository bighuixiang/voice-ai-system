import { describe, expect, it } from "vitest";
import { buildQ003DualTrackReport } from "./q003DualTrackReport.js";

describe("Q-003 dual track report", () => {
  it("does not pick fastest or highest score while Q-003 is unconfirmed", () => {
    expect(buildQ003DualTrackReport({ q003Confirmed: false, latencyMs: 100, costCents: 3, reworkCount: 2, authorAcceptance: 0.6, hardGuardFailures: [], qualityEvidenceRefs: ["review://1"] })).toMatchObject({ mode: "dual-track", winner: null, tracks: { delivery: { latencyMs: 100, costCents: 3 }, quality: { reworkCount: 2, authorAcceptance: 0.6 } } });
  });
});
