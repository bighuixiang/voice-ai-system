import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMilestoneRepairPlan, readMilestoneRepairPlan } from "./milestoneRepairPlan.js";

describe("milestone repair plan", () => {
  it("persists typed repair actions without shrinking the frozen scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-repair-"));
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "book-run-1", runVersion: 3, sourceFingerprint: "source-1", scopedChapterIds: ["c1", "c2"], issues: [
      { kind: "obligation", targetId: "obl-1", reason: "missing terminal evidence", evidenceRefs: ["audit://obl-1"] },
      { kind: "projection", targetId: "story-graph", reason: "stale projection", evidenceRefs: ["projection://story"] }
    ] });
    expect(plan).toMatchObject({ schemaVersion: "milestone-repair-plan.v1", status: "planned", preserveScope: true, scopedChapterIds: ["c1", "c2"] });
    expect(plan.actions.map((action) => action.kind)).toEqual(["obligation", "projection"]);
    await expect(createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "book-run-1", runVersion: 3, sourceFingerprint: "source-1", scopedChapterIds: ["c1", "c2"], issues: [
      { kind: "obligation", targetId: "obl-1", reason: "missing terminal evidence", evidenceRefs: ["audit://obl-1"] },
      { kind: "projection", targetId: "story-graph", reason: "stale projection", evidenceRefs: ["projection://story"] }
    ] })).resolves.toEqual(plan);
    await expect(readMilestoneRepairPlan(root, plan.planId)).resolves.toEqual(plan);
  });

  it("fails closed for empty or evidence-free repair issues and rejects tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "milestone-repair-invalid-"));
    await expect(createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run", runVersion: 1, sourceFingerprint: "source", scopedChapterIds: ["c1"], issues: [] })).rejects.toThrow("MILESTONE_REPAIR_ISSUES_REQUIRED");
    await expect(createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run", runVersion: 1, sourceFingerprint: "source", scopedChapterIds: ["c1"], issues: [{ kind: "continuity", targetId: "c1", reason: "drift", evidenceRefs: [] }] })).rejects.toThrow("MILESTONE_REPAIR_EVIDENCE_REQUIRED");
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "run", runVersion: 1, sourceFingerprint: "source", scopedChapterIds: ["c1"], issues: [{ kind: "continuity", targetId: "c1", reason: "drift", evidenceRefs: ["audit://c1"] }] });
    const target = path.join(root, "sessions", "milestone-repair-plans", `${plan.planId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.preserveScope = false;
    await fs.writeFile(target, JSON.stringify(value), "utf8");
    await expect(readMilestoneRepairPlan(root, plan.planId)).rejects.toThrow("MILESTONE_REPAIR_PLAN_INTEGRITY_FAILED");
  });
});
