import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProjectBackup } from "./projectBackup.js";
import type { RecoveryMode } from "./recoverySettlement.js";

export interface RestorePlan {
  schemaVersion: "restore-plan.v1";
  planId: string;
  projectSlug: string;
  backupId: string;
  mode: RecoveryMode;
  targetWorkspace: string;
  expectedSourceFingerprint: string;
  estimatedLossWindow: string;
  status: "validated";
  productionSwitchAllowed: false;
  createdAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function planPath(root: string, id: string): string { return resolveInside(root, `sessions/restore-plans/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}
export async function createRestorePlan(input: { root: string; projectSlug: string; backupId: string; mode: RecoveryMode; targetWorkspace: string; estimatedLossWindow?: string }): Promise<RestorePlan> {
  const backup = await readProjectBackup(input.root, input.backupId);
  if (!backup || backup.projectSlug !== input.projectSlug) throw new Error("RESTORE_PLAN_BACKUP_NOT_FOUND");
  const planId = `restore-plan-${input.backupId}-${hash({ projectSlug: input.projectSlug, mode: input.mode, targetWorkspace: input.targetWorkspace }).slice(0, 12)}`;
  const existing = await readRestorePlan(input.root, planId);
  if (existing) return existing;
  if (!input.targetWorkspace.trim()) throw new Error("RESTORE_PLAN_TARGET_REQUIRED");
  const base = {
    schemaVersion: "restore-plan.v1" as const, planId, projectSlug: input.projectSlug, backupId: input.backupId, mode: input.mode,
    targetWorkspace: input.targetWorkspace.trim(), expectedSourceFingerprint: backup.sourceFingerprint,
    estimatedLossWindow: (input.estimatedLossWindow || "unknown-until-source-freeze").trim(), status: "validated" as const,
    productionSwitchAllowed: false as const, createdAt: new Date().toISOString()
  };
  const plan: RestorePlan = { ...base, fingerprint: hash(base) };
  await writeJson(planPath(input.root, planId), plan);
  return plan;
}
export async function readRestorePlan(root: string, planId: string): Promise<RestorePlan | null> {
  try { return JSON.parse(await fs.readFile(planPath(root, planId), "utf8")) as RestorePlan; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
