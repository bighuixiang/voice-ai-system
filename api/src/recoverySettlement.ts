import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readRestoreDrill, type RestoreDrillReceipt } from "./restoreDrill.js";
import { readRestorePlan } from "./restorePlan.js";

export type RecoveryMode = "new_project" | "replace" | "repair_missing" | "point_in_time" | "disaster_failover";
export interface RecoverySettlement {
  schemaVersion: "recovery-settlement.v1";
  settlementId: string;
  projectSlug: string;
  backupId: string;
  drillId: string;
  planId: string;
  planFingerprint: string;
  drillFingerprint: string;
  mode: RecoveryMode;
  status: "settled";
  authorConfirmation: string;
  appliedToProduction: false;
  sourceFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function settlementPath(root: string, id: string): string { return resolveInside(root, `sessions/recovery-settlements/${id}.json`); }
function assertDrillIntegrity(drill: RestoreDrillReceipt): void {
  const { fingerprint, ...base } = drill;
  if (!fingerprint || hash(base) !== fingerprint) throw new Error("RECOVERY_DRILL_INTEGRITY_FAILED");
}
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function settleRecovery(input: {
  root: string;
  projectSlug: string;
  backupId: string;
  drillId: string;
  planId: string;
  mode: RecoveryMode;
  authorConfirmation: string;
  expectedSourceFingerprint: string;
}): Promise<RecoverySettlement> {
  const drill = await readRestoreDrill(input.root, input.drillId);
  if (!drill) throw new Error("RECOVERY_DRILL_REQUIRED");
  assertDrillIntegrity(drill);
  const plan = await readRestorePlan(input.root, input.planId);
  if (!plan) throw new Error("RESTORE_PLAN_REQUIRED");
  if (plan.projectSlug !== input.projectSlug || plan.backupId !== input.backupId || plan.mode !== input.mode || plan.expectedSourceFingerprint !== input.expectedSourceFingerprint.trim()) throw new Error("RESTORE_PLAN_SCOPE_MISMATCH");
  if (drill.projectSlug !== input.projectSlug || drill.backupId !== input.backupId) throw new Error("RECOVERY_SCOPE_MISMATCH");
  if (drill.status !== "verified") throw new Error("RECOVERY_DRILL_NOT_VERIFIED");
  if (drill.sourceFingerprint !== input.expectedSourceFingerprint.trim()) throw new Error("RECOVERY_SOURCE_FINGERPRINT_STALE");
  if (!input.authorConfirmation.trim()) throw new Error("RECOVERY_AUTHOR_CONFIRMATION_REQUIRED");
  const settlementId = `recovery-settlement-${input.drillId}`;
  const existing = await readRecoverySettlement(input.root, settlementId);
  if (existing) return existing;
  const base = {
    schemaVersion: "recovery-settlement.v1" as const,
    settlementId,
    projectSlug: input.projectSlug,
    backupId: input.backupId,
    drillId: input.drillId,
    planId: plan.planId,
    planFingerprint: plan.fingerprint,
    drillFingerprint: drill.fingerprint,
    mode: input.mode,
    status: "settled" as const,
    authorConfirmation: input.authorConfirmation.trim(),
    appliedToProduction: false as const,
    sourceFingerprint: drill.sourceFingerprint,
    createdAt: new Date().toISOString()
  };
  const settlement: RecoverySettlement = { ...base, fingerprint: hash(base) };
  await writeJson(settlementPath(input.root, settlementId), settlement);
  return settlement;
}

export async function readRecoverySettlement(root: string, settlementId: string): Promise<RecoverySettlement | null> {
  try { return JSON.parse(await fs.readFile(settlementPath(root, settlementId), "utf8")) as RecoverySettlement; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function listRecoverySettlements(root: string): Promise<RecoverySettlement[]> {
  const directory = resolveInside(root, "sessions/recovery-settlements");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const settlements: RecoverySettlement[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const settlement = await readRecoverySettlement(root, name.slice(0, -5));
    if (settlement) settlements.push(settlement);
  }
  return settlements.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
