import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateCandidateFreshness, readCandidateFreshness, recordCandidateFreshness } from "./candidateFreshness.js";

describe("candidate freshness", () => {
  it("marks an unfinished candidate stale and requires replacement when upstream changes", () => {
    expect(evaluateCandidateFreshness({ projectSlug: "p", candidateId: "c", candidateSourceFingerprint: "v1", currentUpstreamFingerprint: "v2", executionState: "running" })).toMatchObject({ disposition: "stale-candidate", replacementRequired: true, reason: "UPSTREAM_VERSION_CHANGED" });
  });

  it("routes a settled chapter to audit-pending and persists idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-freshness-"));
    const input = { root, projectSlug: "p", candidateId: "c", candidateSourceFingerprint: "v1", currentUpstreamFingerprint: "v2", executionState: "completed" as const, chapterSettled: true };
    const first = await recordCandidateFreshness(input);
    const replay = await recordCandidateFreshness(input);
    expect(first).toMatchObject({ disposition: "audit-pending", replacementRequired: true });
    expect(replay).toEqual(first);
    expect(await readCandidateFreshness(root, first.receiptId)).toEqual(first);
  });
});
