import { describe, expect, it } from "vitest";
import { createSeedCompilationRun, replaySeedCompilationRun, transitionSeedCompilationRun } from "./seedCompilationRun.js";

describe("seed compilation run", () => {
  it("freezes input and separates container creation from interpretation completion", () => {
    const run = createSeedCompilationRun({ projectSlug: "p1", idempotencyKey: "idem-1", inputFingerprint: "input-1", compilerVersion: "compiler-1", sourceMessageIds: ["m-1"] });
    expect(run).toMatchObject({ status: "captured", containerCreated: true, interpretationComplete: false, modelCallIssued: false, canonWritten: false });
  });

  it("allows deterministic transitions and records a recovery checkpoint", () => {
    const captured = createSeedCompilationRun({ projectSlug: "p1", idempotencyKey: "idem-1", inputFingerprint: "input-1", compilerVersion: "compiler-1", sourceMessageIds: ["m-1"] });
    const interpreting = transitionSeedCompilationRun(captured, "interpreting", { checkpoint: "facet-extraction" });
    const failed = transitionSeedCompilationRun(interpreting, "failed", { failure: { layer: "interpreter", message: "provider unavailable" }, recoveryAction: "resume-from-facet-extraction" });
    expect(failed).toMatchObject({ status: "failed", recoveryCheckpoint: "facet-extraction", recoveryAction: "resume-from-facet-extraction" });
  });

  it("replays only against the same frozen input and compiler", () => {
    const run = createSeedCompilationRun({ projectSlug: "p1", idempotencyKey: "idem-2", inputFingerprint: "input-2", compilerVersion: "compiler-2", sourceMessageIds: ["m-2"] });
    expect(replaySeedCompilationRun(run, { inputFingerprint: "input-2", compilerVersion: "compiler-2" })).toMatchObject({ replayable: true });
    expect(replaySeedCompilationRun(run, { inputFingerprint: "input-other", compilerVersion: "compiler-2" })).toMatchObject({ replayable: false, reason: "input-fingerprint-stale" });
  });
});
