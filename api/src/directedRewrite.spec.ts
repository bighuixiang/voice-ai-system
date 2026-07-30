import { describe, expect, it } from "vitest";
import { createDirectedRewrite, validateDirectedRewrite } from "./directedRewrite.js";

const valid = { rewriteId: "rewrite-1", sourceCandidateId: "candidate-1", original: "Hero warns the guard and leaves.", directives: ["make the warning cost trust", "keep the gate location"], protectedAnchors: ["gate", "warning"], changedSegments: [{ before: "leaves", after: "is detained" }], rationale: "increase consequence without changing location", evidenceRefs: ["review://rewrite-1"] };

describe("directed rewrite", () => {
  it("keeps scope and protected anchors explicit", () => {
    const rewrite = createDirectedRewrite(valid);
    expect(rewrite.status).toBe("candidate");
    expect(validateDirectedRewrite(rewrite).status).toBe("ready");
  });

  it("blocks a rewrite that drops protected anchors", () => {
    const rewrite = createDirectedRewrite({ ...valid, changedSegments: [{ before: "gate", after: "forest" }] });
    expect(validateDirectedRewrite(rewrite).issues).toContain("DIRECTED_REWRITE_PROTECTED_ANCHOR_CHANGED");
  });

  it("rejects vague rewrites without directives or evidence", () => {
    expect(() => createDirectedRewrite({ ...valid, directives: [] })).toThrow("DIRECTED_REWRITE_DIRECTIVES_REQUIRED");
    expect(() => createDirectedRewrite({ ...valid, evidenceRefs: [] })).toThrow("DIRECTED_REWRITE_EVIDENCE_REQUIRED");
  });
});
