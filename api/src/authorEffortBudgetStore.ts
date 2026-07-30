import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { AuthorEffortBudget } from "./authorEffortBudget.js";

const file = (root: string) => resolveInside(root, "sessions/author-effort-budget.json");
const fingerprintFor = (budget: AuthorEffortBudget) => {
  const { fingerprint: _fingerprint, ...base } = budget;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
};

export async function writeAuthorEffortBudget(root: string, budget: AuthorEffortBudget): Promise<void> {
  const target = file(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(budget, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readAuthorEffortBudget(root: string): Promise<AuthorEffortBudget | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file(root), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const budget = JSON.parse(raw) as AuthorEffortBudget;
  if (!budget || budget.fingerprint !== fingerprintFor(budget)) {
    throw new Error("EFFORT_BUDGET_INTEGRITY_FAILED");
  }
  return budget;
}
