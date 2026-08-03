import { describe, expect, it } from "vitest";
import { buildTaskContextPlan } from "./taskContextPlan.js";

describe("task context plan", () => {
  it("records selected blocks, tier budgets, and boundary compression", () => {
    const plan = buildTaskContextPlan([
      { title: "Story Contract", content: "contract" },
      { title: "Target Chapter", content: "trimmed chapter" },
      {
        title: "context-budget-log",
        content: JSON.stringify({
          version: "context-budget:v2",
          blockPlan: [
            { title: "Story Contract", tier: "T0", originalLength: 8, finalLength: 8, truncated: false },
            { title: "Target Chapter", tier: "T3", originalLength: 120, finalLength: 15, truncated: true }
          ]
        })
      }
    ]);

    expect(plan).toMatchObject({ schemaVersion: "context-plan.v1", status: "warn" });
    expect(plan.blocks).toEqual([
      expect.objectContaining({ title: "Story Contract", tier: "T0", selected: true, compression: "none", originalTokens: 2, finalTokens: 2 }),
      expect.objectContaining({ title: "Target Chapter", tier: "T3", selected: true, compression: "boundary-trim", truncated: true, originalTokens: 30, finalTokens: 4 })
    ]);
    expect(plan.truncatedBlocks).toEqual(["Target Chapter"]);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic and reports a pass when no block was trimmed", () => {
    const blocks = [
      { title: "Story Contract", content: "contract" },
      { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "Story Contract", tier: "T0", originalLength: 8, finalLength: 8, truncated: false }] }) }
    ];
    const first = buildTaskContextPlan(blocks);
    const second = buildTaskContextPlan(blocks);
    expect(first).toEqual(second);
    expect(first.status).toBe("pass");
    expect(first.truncatedBlocks).toEqual([]);
  });
});
