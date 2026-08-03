import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface AutonomyGrant {
  schemaVersion: "autonomy-grant.v1";
  grantId: string;
  projectSlug: string;
  bookRunId: string;
  chapterIds: string[];
  autonomyLevel: "L0" | "L1" | "L2";
  status: "active" | "revoked";
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
  revokeReason?: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function grantPath(root: string, grantId: string): string { return resolveInside(root, `sessions/autonomy-grants/${grantId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }

export function assertAutonomyGrantIntegrity(grant: AutonomyGrant): AutonomyGrant {
  const { fingerprint: _fingerprint, ...base } = grant;
  const valid = grant.schemaVersion === "autonomy-grant.v1" && Boolean(grant.grantId?.trim() && grant.projectSlug?.trim() && grant.bookRunId?.trim() && grant.createdAt?.trim() && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > 0) && Array.isArray(grant.chapterIds) && grant.chapterIds.length > 0 && grant.chapterIds.every((id) => typeof id === "string" && id.trim()) && ["L0", "L1", "L2"].includes(grant.autonomyLevel) && ["active", "revoked"].includes(grant.status) && (grant.status === "revoked" ? Boolean(grant.revokedAt?.trim() && grant.revokeReason?.trim()) : !grant.revokedAt && !grant.revokeReason) && /^[a-f0-9]{64}$/i.test(grant.fingerprint) && hash(base) === grant.fingerprint;
  if (!valid) throw new Error("AUTONOMY_GRANT_INTEGRITY_FAILED");
  return grant;
}

export async function readAutonomyGrant(root: string, grantId: string): Promise<AutonomyGrant | null> {
  try { return assertAutonomyGrantIntegrity(JSON.parse(await fs.readFile(grantPath(root, grantId), "utf8")) as AutonomyGrant); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createAutonomyGrant(root: string, input: { grantId: string; projectSlug: string; bookRunId: string; chapterIds: string[]; autonomyLevel: "L0" | "L1" | "L2"; expiresAt: string }): Promise<AutonomyGrant> {
  const chapterIds = [...new Set(input.chapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!input.grantId.trim() || !input.projectSlug.trim() || !input.bookRunId.trim() || !chapterIds.length || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= 0) throw new Error("AUTONOMY_GRANT_FIELDS_INVALID");
  const existing = await readAutonomyGrant(root, input.grantId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug || existing.bookRunId !== input.bookRunId) throw new Error("AUTONOMY_GRANT_SCOPE_CONFLICT");
    return existing;
  }
  const base = { schemaVersion: "autonomy-grant.v1" as const, grantId: input.grantId, projectSlug: input.projectSlug, bookRunId: input.bookRunId, chapterIds, autonomyLevel: input.autonomyLevel, status: "active" as const, expiresAt: input.expiresAt, createdAt: new Date().toISOString() };
  const grant: AutonomyGrant = { ...base, fingerprint: hash(base) };
  await writeJson(grantPath(root, grant.grantId), grant);
  return grant;
}

export function evaluateAutonomyGrant(grant: AutonomyGrant, nowMs = Date.now()): { active: boolean; reason?: "AUTONOMY_GRANT_EXPIRED" | "AUTONOMY_GRANT_REVOKED" } {
  if (grant.status === "revoked") return { active: false, reason: "AUTONOMY_GRANT_REVOKED" };
  if (nowMs >= Date.parse(grant.expiresAt)) return { active: false, reason: "AUTONOMY_GRANT_EXPIRED" };
  return { active: true };
}

export async function revokeAutonomyGrant(root: string, grantId: string, reason: string): Promise<AutonomyGrant> {
  const current = await readAutonomyGrant(root, grantId);
  if (!current) throw new Error("AUTONOMY_GRANT_NOT_FOUND");
  if (current.status === "revoked") return current;
  if (!reason.trim()) throw new Error("AUTONOMY_GRANT_REVOKE_REASON_REQUIRED");
  const base = { ...current, status: "revoked" as const, revokedAt: new Date().toISOString(), revokeReason: reason.trim() };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: AutonomyGrant = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(grantPath(root, grantId), next);
  return next;
}
