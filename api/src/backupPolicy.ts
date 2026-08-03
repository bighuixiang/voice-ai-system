import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface BackupPolicy {
  schemaVersion: "backup-policy.v1";
  projectSlug: string;
  trigger: "manual" | "milestone" | "automatic";
  maxRpoMinutes: number;
  targetRtoMinutes: number;
  minimumCopies: number;
  faultDomains: string[];
  externalCopyRequired: boolean;
  maxUnverifiedAgeMinutes: number;
  version: number;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function policyPath(root: string): string { return resolveInside(root, "sessions/backup-policy.json"); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}
export function assessBackupDurability(policy: BackupPolicy | null, manifest: { faultDomain: string; createdAt: string }): { status: "satisfied" | "degraded" | "blocked"; reasons: string[] } {
  if (!policy) return { status: "degraded", reasons: ["BACKUP_POLICY_REQUIRED"] };
  const reasons: string[] = [];
  if (policy.minimumCopies > 1 && policy.faultDomains.length < policy.minimumCopies) reasons.push("BACKUP_FAULT_DOMAIN_COVERAGE_INSUFFICIENT");
  if (policy.minimumCopies > 1 && manifest.faultDomain === "same-workspace") reasons.push("BACKUP_FAULT_DOMAIN_COVERAGE_INSUFFICIENT");
  if (policy.externalCopyRequired && manifest.faultDomain === "same-workspace") reasons.push("BACKUP_EXTERNAL_COPY_REQUIRED");
  if (!policy.faultDomains.includes(manifest.faultDomain)) reasons.push("BACKUP_MANIFEST_FAULT_DOMAIN_UNDECLARED");
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (!Number.isFinite(age) || age > policy.maxUnverifiedAgeMinutes * 60_000) reasons.push("BACKUP_VERIFICATION_TOO_OLD");
  return { status: reasons.length ? "degraded" : "satisfied", reasons };
}
export async function saveBackupPolicy(root: string, input: Omit<BackupPolicy, "schemaVersion" | "version" | "updatedAt" | "fingerprint">): Promise<BackupPolicy> {
  if (!input.projectSlug.trim() || input.minimumCopies < 1 || input.maxRpoMinutes <= 0 || input.targetRtoMinutes <= 0 || input.maxUnverifiedAgeMinutes <= 0) throw new Error("BACKUP_POLICY_INVALID");
  const existing = await readBackupPolicy(root);
  const base = { ...input, schemaVersion: "backup-policy.v1" as const, version: (existing?.version || 0) + 1, updatedAt: new Date().toISOString() };
  const policy: BackupPolicy = { ...base, fingerprint: hash(base) };
  await writeJson(policyPath(root), policy);
  return policy;
}
export async function readBackupPolicy(root: string): Promise<BackupPolicy | null> {
  try {
    const policy = JSON.parse(await fs.readFile(policyPath(root), "utf8")) as BackupPolicy;
    const { fingerprint, ...base } = policy;
    if (!fingerprint || hash(base) !== fingerprint) throw new Error("BACKUP_POLICY_INTEGRITY_FAILED");
    return policy;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
