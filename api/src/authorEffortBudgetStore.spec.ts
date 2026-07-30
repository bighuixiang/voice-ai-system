import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthorEffortBudget } from "./authorEffortBudget.js";
import { readAuthorEffortBudget, writeAuthorEffortBudget } from "./authorEffortBudgetStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("author effort budget persistence", () => {
  it("survives a fresh read from the session store", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "effort-budget-store-")); roots.push(root);
    const budget = createAuthorEffortBudget({ projectSlug: "p1", phase: "exploration" });
    await writeAuthorEffortBudget(root, budget);
    expect(await readAuthorEffortBudget(root)).toEqual(budget);
  });

  it("fails closed when a persisted budget fingerprint is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "effort-budget-store-")); roots.push(root);
    const budget = createAuthorEffortBudget({ projectSlug: "p1", phase: "audit" });
    await writeAuthorEffortBudget(root, { ...budget, limits: { ...budget.limits, reviewItems: 999 } });
    await expect(readAuthorEffortBudget(root)).rejects.toThrow("EFFORT_BUDGET_INTEGRITY_FAILED");
  });
});
