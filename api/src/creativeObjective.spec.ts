import { describe, expect, it } from "vitest";
import { createCreativeObjectiveProfile, evaluateObjectiveConflict } from "./creativeObjective.js";

const item = (id: string, kind: "hard_constraint" | "preference" | "aspiration" | "anti_goal" | "unknown", text: string) => ({ objectiveId: id, kind, text, scope: "work" as const, sourceRefs: [`author://${id}`], verification: "review against candidate" });

describe("creative objective governance", () => {
  it("creates a versioned, source-bound objective profile with layered semantics", () => {
    const profile = createCreativeObjectiveProfile({ profileId: "obj-1", projectSlug: "demo", version: 1, stage: "understanding", items: [item("h1", "hard_constraint", "代价必须可信"), item("p1", "preference", "节奏明快"), item("u1", "unknown", "目标受众") ] });
    expect(profile).toMatchObject({ schemaVersion: "creative-objective-profile.v1", version: 1, items: [{ kind: "hard_constraint" }, { kind: "preference" }, { kind: "unknown" }] });
    expect(() => createCreativeObjectiveProfile({ profileId: "obj-2", projectSlug: "demo", version: 1, stage: "understanding", items: [{ ...item("h", "hard_constraint", "x"), sourceRefs: [] }] })).toThrow("OBJECTIVE_SOURCE_REQUIRED");
  });

  it("makes objective conflicts explicit and gates two hard constraints for author review", () => {
    const result = evaluateObjectiveConflict({ conflictId: "conflict-1", left: item("h1", "hard_constraint", "代价可信"), right: item("h2", "hard_constraint", "节奏极快"), benefits: ["可信", "推进"], costs: ["返工", "信息压缩"], affectedScopes: ["chapter-1"], compromises: ["关键场景保留代价，过渡段加速"], evidenceRefs: ["analysis://conflict-1"] });
    expect(result).toMatchObject({ schemaVersion: "objective-conflict.v1", level: "L2", status: "needs-author", authorRequired: true });
    expect(() => evaluateObjectiveConflict({ ...result, evidenceRefs: [] })).toThrow("OBJECTIVE_CONFLICT_EVIDENCE_REQUIRED");
  });
});
