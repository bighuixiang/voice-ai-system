import { describe, expect, it } from "vitest";
import { buildCraftContextBudget } from "./craftContextBudget.js";

const valid = { taskId: "task-1", requiredFunctions: ["investigation"], tokenBudget: 100, items: [{ itemId: "p1", kind: "pattern" as const, approved: true, tokens: 30, covers: ["investigation"], content: "abstract mechanism" }, { itemId: "e1", kind: "evidence" as const, approved: true, tokens: 20, covers: ["investigation"], content: "minimal anchor" }], forbiddenItems: [{ itemId: "raw1", kind: "raw-sample" as const, reason: "untrusted" }], sourceRefs: ["context://1"] };
describe("craft context budget and minimum evidence", () => {
  it("selects minimum approved mechanism evidence within budget", () => { const result = buildCraftContextBudget(valid); expect(result.selectedItemIds).toEqual(["p1", "e1"]); expect(result.totalTokens).toBe(50); });
  it("blocks raw samples and missing boundary evidence", () => { const result = buildCraftContextBudget({ ...valid, items: [{ ...valid.items[0], approved: false }], forbiddenItems: [] }); expect(result.status).toBe("blocked"); expect(result.issues).toContain("APPROVED_MECHANISM_EVIDENCE_REQUIRED"); });
  it("does not fill uncertainty with more web text and enforces budget", () => { expect(() => buildCraftContextBudget({ ...valid, tokenBudget: 10 })).toThrow("CONTEXT_BUDGET_INSUFFICIENT"); expect(buildCraftContextBudget({ ...valid, items: [...valid.items, { itemId: "raw2", kind: "web-text" as const, approved: true, tokens: 10, covers: ["investigation"], content: "web" }] }).forbiddenItemIds).toContain("raw2"); });
});
