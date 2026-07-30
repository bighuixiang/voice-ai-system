import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readUnderstandingBudget, reserveUnderstandingBudget } from "./understandingBudget.js";

const manifest = { schemaVersion: "context-manifest.v1" as const, manifestId: "m-1", projectSlug: "p1", purpose: "understanding" as const, sourceSessionId: "s-1", sourceFingerprint: "fp-1", sourceMessages: [], frozenAt: new Date().toISOString() };

describe("understanding budget persistence integrity", () => {
  it("fails closed when the persisted reservation is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-budget-"));
    await reserveUnderstandingBudget(root, "p1", manifest, { reservationId: "r-1", units: 10 });
    const budgetPath = path.join(root, "sessions", "understanding-budget.json");
    const budget = JSON.parse(await fs.readFile(budgetPath, "utf8")) as Record<string, unknown>;
    budget.units = 999;
    await fs.writeFile(budgetPath, JSON.stringify(budget), "utf8");
    await expect(readUnderstandingBudget(root)).rejects.toThrow("UNDERSTANDING_BUDGET_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });
});
