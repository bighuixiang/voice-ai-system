import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type EvaluationAccessUse = "project-evaluation" | "platform-regression";
export interface EvaluationAccessGrant {
  schemaVersion: "evaluation-access-grant.v1";
  grantId: string;
  projectSlug: string;
  use: EvaluationAccessUse;
  sourceRefs: string[];
  minimized: true;
  anonymized: true;
  status: "active" | "revoked";
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const grantPath = (root: string, grantId: string) => resolveInside(root, path.join("evaluations", "access-grants", `${grantId}.json`));

export function assertEvaluationAccessGrantIntegrity(grant: EvaluationAccessGrant, expectedId?: string): EvaluationAccessGrant {
  const { fingerprint, ...base } = grant;
  const revokedValid = grant.status !== "revoked" || (typeof grant.revokedAt === "string" && grant.revokedAt.trim() && typeof grant.revocationReason === "string" && grant.revocationReason.trim() && !Number.isNaN(Date.parse(grant.revokedAt)));
  const valid = grant?.schemaVersion === "evaluation-access-grant.v1" && (!expectedId || grant.grantId === expectedId) && [grant.grantId, grant.projectSlug, grant.createdAt].every((value) => typeof value === "string" && value.trim()) && ["project-evaluation", "platform-regression"].includes(grant.use) && Array.isArray(grant.sourceRefs) && grant.sourceRefs.length > 0 && grant.sourceRefs.every((ref) => typeof ref === "string" && ref.trim()) && grant.minimized === true && grant.anonymized === true && ["active", "revoked"].includes(grant.status) && revokedValid && !Number.isNaN(Date.parse(grant.createdAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("EVALUATION_ACCESS_GRANT_INTEGRITY_FAILED");
  return grant;
}

async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function createEvaluationAccessGrant(input: { projectSlug: string; use: EvaluationAccessUse; sourceRefs: readonly string[]; minimized: boolean; anonymized: boolean }): EvaluationAccessGrant {
  if (!input.projectSlug.trim() || !["project-evaluation", "platform-regression"].includes(input.use) || !input.sourceRefs.length || input.sourceRefs.some((ref) => !ref.trim())) throw new Error("EVALUATION_ACCESS_GRANT_FIELDS_INVALID");
  if (!input.minimized || !input.anonymized) throw new Error("EVALUATION_ACCESS_PRIVACY_REQUIRED");
  const base = { schemaVersion: "evaluation-access-grant.v1" as const, grantId: `evaluation-access-${input.projectSlug}-${hash({ use: input.use, sourceRefs: [...input.sourceRefs].sort() }).slice(0, 20)}`, projectSlug: input.projectSlug.trim(), use: input.use, sourceRefs: [...new Set(input.sourceRefs.map((ref) => ref.trim()))].sort(), minimized: true as const, anonymized: true as const, status: "active" as const, createdAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}

export async function readEvaluationAccessGrant(root: string, grantId: string): Promise<EvaluationAccessGrant | null> {
  const grant = await readJson<EvaluationAccessGrant>(grantPath(root, grantId));
  if (!grant) return null;
  return assertEvaluationAccessGrantIntegrity(grant, grantId);
}

export async function persistEvaluationAccessGrant(root: string, grant: EvaluationAccessGrant): Promise<{ created: boolean; grant: EvaluationAccessGrant }> {
  assertEvaluationAccessGrantIntegrity(grant);
  const existing = await readEvaluationAccessGrant(root, grant.grantId);
  if (existing) {
    if (existing.fingerprint === grant.fingerprint) return { created: false, grant: existing };
    throw new Error("EVALUATION_ACCESS_GRANT_IMMUTABLE");
  }
  await writeJson(grantPath(root, grant.grantId), grant);
  return { created: true, grant };
}

export async function revokeEvaluationAccessGrant(root: string, grantId: string, reason: string): Promise<EvaluationAccessGrant> {
  const current = await readEvaluationAccessGrant(root, grantId);
  if (!current) throw new Error("EVALUATION_ACCESS_GRANT_NOT_FOUND");
  if (current.status === "revoked") return current;
  const { fingerprint: _oldFingerprint, ...currentBase } = current;
  const base = { ...currentBase, status: "revoked" as const, revokedAt: new Date().toISOString(), revocationReason: reason.trim() };
  if (!reason.trim()) throw new Error("EVALUATION_ACCESS_REVOCATION_REASON_REQUIRED");
  const next = { ...base, fingerprint: hash(base) };
  await writeJson(grantPath(root, grantId), next);
  return next;
}

export async function assertEvaluationAccessGrantCurrent(root: string, grantId: string, input: { projectSlug: string; use: EvaluationAccessUse }): Promise<EvaluationAccessGrant> {
  const grant = await readEvaluationAccessGrant(root, grantId);
  if (!grant) throw new Error("EVALUATION_ACCESS_GRANT_NOT_FOUND");
  if (grant.projectSlug !== input.projectSlug || grant.use !== input.use) throw new Error("EVALUATION_ACCESS_SCOPE_MISMATCH");
  if (grant.status !== "active") throw new Error("EVALUATION_ACCESS_REVOKED");
  return grant;
}
