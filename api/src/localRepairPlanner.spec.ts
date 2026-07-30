import { describe, expect, it } from "vitest";
import { createLocalRepairPlan, validateLocalRepairPlan } from "./localRepairPlanner.js";

const valid = { planId: "repair-1", documentId: "chapter-1", issueId: "issue-pov-1", issueCode: "POV_SECRET_UNEARNED", span: { start: 120, end: 148, text: "the captain planned betrayal" }, operation: "replace-span" as const, replacement: "the captain seemed tense", preserveContext: ["gate remains locked", "hero does not know the plan"], maxScope: "paragraph", authorEvidenceRefs: ["review://issue-pov-1"] };

describe("local repair planner", () => {
  it("plans the smallest repair span and preserves unaffected context", () => {
    const plan = createLocalRepairPlan(valid);
    expect(plan.status).toBe("ready");
    expect(validateLocalRepairPlan(plan).status).toBe("ready");
  });

  it("blocks whole-chapter rewrites without explicit author authorization", () => {
    expect(() => createLocalRepairPlan({ ...valid, maxScope: "chapter", operation: "rewrite-chapter" as const, authorAuthorization: "" })).toThrow("LOCAL_REPAIR_SCOPE_TOO_BROAD");
  });

  it("requires an anchored issue and evidence", () => {
    expect(() => createLocalRepairPlan({ ...valid, span: { start: 0, end: 0, text: "" } })).toThrow("LOCAL_REPAIR_SPAN_REQUIRED");
    expect(() => createLocalRepairPlan({ ...valid, authorEvidenceRefs: [] })).toThrow("LOCAL_REPAIR_EVIDENCE_REQUIRED");
  });
});
