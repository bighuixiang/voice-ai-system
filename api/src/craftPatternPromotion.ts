import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { CraftExperiment } from "./craftExperiment.js";
import type { CraftPattern } from "./craftPattern.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function patternPath(root: string, id: string): string { return resolveInside(root, `sessions/craft-patterns/${id}.json`); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }

export async function promoteCraftPatternFromExperiment(input: { root: string; patternId: string; experiment: CraftExperiment; actor: string; reason: string }): Promise<CraftPattern> {
  if (!input.actor.trim() || !input.reason.trim()) throw new Error("CRAFT_PATTERN_PROMOTION_APPROVAL_REQUIRED");
  const pattern = await readJson<CraftPattern>(patternPath(input.root, input.patternId));
  if (!pattern) throw new Error("CRAFT_PATTERN_NOT_FOUND");
  if (pattern.lifecycle !== "approved") throw new Error("CRAFT_PATTERN_APPROVAL_REQUIRED");
  if (input.experiment.status !== "judged" || input.experiment.judgment?.winner !== "treatment" || !input.experiment.judgment.hardGuardsPassed) throw new Error("CRAFT_PATTERN_PROMOTION_BLOCKED");
  const base = { ...pattern, lifecycle: "probation" as const, promotion: { experimentId: input.experiment.experimentId, actor: input.actor, reason: input.reason, promotedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  const promoted: CraftPattern = { ...base, fingerprint: hash(base) };
  await writeJson(patternPath(input.root, promoted.patternId), promoted);
  return promoted;
}
