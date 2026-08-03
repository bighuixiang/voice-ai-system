import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareCandidates } from "./candidateComparison.js";
import { persistCandidateComparison, readCandidateComparison } from "./candidateComparisonStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

const comparison = () => compareCandidates({ objectiveIds: ["voice"], candidates: [{ candidateId: "a", hardConstraintFailures: [], objectiveEvidence: [{ objectiveId: "voice", gap: 0, evidenceRefs: ["evidence://a"] }], unresolvedRisks: [] }] });

describe("candidate comparison persistence", () => {
  it("persists and replays a project-bound comparison", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-comparison-")); roots.push(root);
    const first = await persistCandidateComparison(root, "demo", comparison());
    const second = await persistCandidateComparison(root, "demo", comparison());
    expect(second).toEqual(first);
    expect(first.projectSlug).toBe("demo");
    await expect(readCandidateComparison(root, first.comparisonId, "demo")).resolves.toEqual(first);
  });

  it("does not expose a comparison across projects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-comparison-scope-")); roots.push(root);
    const record = await persistCandidateComparison(root, "demo", comparison());
    await expect(readCandidateComparison(root, record.comparisonId, "other")).resolves.toBeNull();
  });
});
