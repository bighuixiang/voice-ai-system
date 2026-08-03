import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface AdoptedSeedField { field: string; value: string; status: "adopted" | "unknown"; semanticId?: string; }
export interface SeedAdoptionResult { schemaVersion: "seed-adoption.v1"; fields: AdoptedSeedField[]; rejected: string[]; fingerprint: string; }
export interface IncrementalSeedRecompile { schemaVersion: "seed-incremental-recompile.v1"; recompiled: string[]; preserved: string[]; fingerprint: string; }
export interface SeedRecompileReceipt { schemaVersion: "seed-recompile-receipt.v1"; adoptionFingerprint: string; targetVersionId: string; changedFields: string[]; recompiledFields: string[]; preservedFields: string[]; rollbackPoint: string; status: "completed"; fingerprint: string; }
export interface SeedAdoptionRevocation { schemaVersion: "seed-adoption-revocation.v1"; adoptionFingerprint: string; field: string; reason: string; affectedFields: string[]; recompiledFields: string[]; protectedAffectedFields: string[]; blockers: string[]; status: "revoked"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const semanticId = (field: string) => `seed-field-${hash(field).slice(0, 12)}`;
const adoptionPath = (root: string) => resolveInside(root, "sessions/seed-adoption.json");
const revocationPath = (root: string) => resolveInside(root, "sessions/seed-adoption-revocations.json");
const recompilePath = (root: string) => resolveInside(root, "sessions/seed-recompile-receipts.json");

export function adoptSeedFields(input: { existing: readonly AdoptedSeedField[]; decisions: ReadonlyArray<{ field: string; value: string; decision: "accept" | "reject" }> }): SeedAdoptionResult {
  const fields = input.existing.map((field) => ({ ...field })); const rejected: string[] = [];
  for (const decision of input.decisions) {
    const index = fields.findIndex((field) => field.field === decision.field);
    if (decision.decision === "reject") { rejected.push(decision.field); continue; }
    const next = { field: decision.field, value: decision.value, status: "adopted" as const, semanticId: fields[index]?.semanticId ?? semanticId(decision.field) };
    if (index >= 0) fields[index] = next; else fields.push(next);
  }
  const base = { schemaVersion: "seed-adoption.v1" as const, fields, rejected };
  return { ...base, fingerprint: hash(base) };
}

export function recompileSeedIncrementally(input: { fields: ReadonlyArray<{ field: string; value: string; version: number }>; changedFields: readonly string[]; dependencyMap: Record<string, readonly string[]> }): IncrementalSeedRecompile {
  const changed = new Set(input.changedFields);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const field of input.fields) {
      if (changed.has(field.field)) continue;
      if ((input.dependencyMap[field.field] ?? []).some((dependency) => changed.has(dependency))) {
        changed.add(field.field);
        expanded = true;
      }
    }
  }
  const recompiled = input.fields.filter((field) => changed.has(field.field)).map((field) => field.field); const base = { schemaVersion: "seed-incremental-recompile.v1" as const, recompiled, preserved: input.fields.map((field) => field.field).filter((field) => !recompiled.includes(field)) };
  return { ...base, fingerprint: hash(base) };
}

export function assertSeedAdoptionIntegrity(value: unknown): asserts value is SeedAdoptionResult {
  if (!value || typeof value !== "object") throw new Error("SEED_ADOPTION_INTEGRITY_FAILED");
  const result = value as Record<string, unknown>;
  if (result.schemaVersion !== "seed-adoption.v1" || !Array.isArray(result.fields) || !Array.isArray(result.rejected) || result.rejected.some((item) => typeof item !== "string" || !item.trim()) || typeof result.fingerprint !== "string") throw new Error("SEED_ADOPTION_INTEGRITY_FAILED");
  const fieldNames = new Set<string>();
  for (const field of result.fields as Array<Record<string, unknown>>) {
    if (!field || typeof field.field !== "string" || !field.field.trim() || fieldNames.has(field.field) || typeof field.value !== "string" || !field.value.trim() || (field.status !== "adopted" && field.status !== "unknown") || (field.semanticId !== undefined && (typeof field.semanticId !== "string" || !field.semanticId.trim() || field.semanticId !== semanticId(field.field)))) throw new Error("SEED_ADOPTION_INTEGRITY_FAILED");
    fieldNames.add(field.field);
  }
  const { fingerprint, ...base } = result;
  if (hash(base) !== fingerprint) throw new Error("SEED_ADOPTION_INTEGRITY_FAILED");
}

export async function readSeedAdoption(root: string): Promise<SeedAdoptionResult | null> {
  let raw: string;
  try { raw = await fs.readFile(adoptionPath(root), "utf8"); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("SEED_ADOPTION_INTEGRITY_FAILED"); }
  assertSeedAdoptionIntegrity(parsed);
  return parsed;
}

export async function persistSeedAdoption(root: string, result: SeedAdoptionResult): Promise<{ result: SeedAdoptionResult; created: boolean }> {
  assertSeedAdoptionIntegrity(result);
  const existing = await readSeedAdoption(root);
  if (existing) {
    if (existing.fingerprint !== result.fingerprint) throw new Error("SEED_ADOPTION_IDEMPOTENCY_CONFLICT");
    return { result: existing, created: false };
  }
  const target = adoptionPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { result, created: true };
}

export function revokeSeedAdoption(input: { adoption: SeedAdoptionResult; field: string; reason: string; dependencyMap: Record<string, readonly string[]>; protectedFields?: readonly string[] }): SeedAdoptionRevocation {
  assertSeedAdoptionIntegrity(input.adoption);
  const field = input.field.trim();
  if (!field || !input.adoption.fields.some((item) => item.field === field && item.status === "adopted")) throw new Error("SEED_ADOPTION_FIELD_NOT_ADOPTED");
  if (!input.reason.trim()) throw new Error("SEED_ADOPTION_REVOCATION_REASON_REQUIRED");
  const recompiled = recompileSeedIncrementally({ fields: input.adoption.fields.map((item) => ({ field: item.field, value: item.value, version: 1 })), changedFields: [field], dependencyMap: input.dependencyMap }).recompiled;
  const affectedFields = [...new Set(input.dependencyMap[field] ?? [])];
  const protectedSet = new Set(input.protectedFields ?? []);
  const protectedAffectedFields = affectedFields.filter((item) => protectedSet.has(item));
  const base = { schemaVersion: "seed-adoption-revocation.v1" as const, adoptionFingerprint: input.adoption.fingerprint, field, reason: input.reason, affectedFields, recompiledFields: recompiled, protectedAffectedFields, blockers: protectedAffectedFields.length ? ["PROTECTED_ASSET_AFFECTED"] : [], status: "revoked" as const };
  return { ...base, fingerprint: hash(base) };
}

export function assertSeedAdoptionRevocationIntegrity(value: unknown): asserts value is SeedAdoptionRevocation {
  if (!value || typeof value !== "object") throw new Error("SEED_ADOPTION_REVOCATION_INTEGRITY_FAILED");
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== "seed-adoption-revocation.v1" || typeof receipt.adoptionFingerprint !== "string" || !receipt.adoptionFingerprint.trim() || typeof receipt.field !== "string" || !receipt.field.trim() || typeof receipt.reason !== "string" || !receipt.reason.trim() || !Array.isArray(receipt.affectedFields) || !Array.isArray(receipt.recompiledFields) || !Array.isArray(receipt.protectedAffectedFields) || !Array.isArray(receipt.blockers) || receipt.status !== "revoked" || typeof receipt.fingerprint !== "string" || [...receipt.affectedFields, ...receipt.recompiledFields, ...receipt.protectedAffectedFields, ...receipt.blockers].some((item) => typeof item !== "string" || !item.trim())) throw new Error("SEED_ADOPTION_REVOCATION_INTEGRITY_FAILED");
  const { fingerprint, ...base } = receipt;
  if (hash(base) !== fingerprint) throw new Error("SEED_ADOPTION_REVOCATION_INTEGRITY_FAILED");
}

export async function readSeedAdoptionRevocations(root: string): Promise<SeedAdoptionRevocation[]> {
  let raw: string;
  try { raw = await fs.readFile(revocationPath(root), "utf8"); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("SEED_ADOPTION_REVOCATION_INTEGRITY_FAILED"); }
  if (!Array.isArray(parsed)) throw new Error("SEED_ADOPTION_REVOCATION_INTEGRITY_FAILED");
  for (const item of parsed) assertSeedAdoptionRevocationIntegrity(item);
  return parsed as SeedAdoptionRevocation[];
}

export async function persistSeedAdoptionRevocation(root: string, receipt: SeedAdoptionRevocation): Promise<{ receipt: SeedAdoptionRevocation; created: boolean }> {
  assertSeedAdoptionRevocationIntegrity(receipt);
  const current = await readSeedAdoptionRevocations(root);
  const existing = current.find((item) => item.adoptionFingerprint === receipt.adoptionFingerprint && item.field === receipt.field);
  if (existing) {
    if (existing.fingerprint !== receipt.fingerprint) throw new Error("SEED_ADOPTION_REVOCATION_IDEMPOTENCY_CONFLICT");
    return { receipt: existing, created: false };
  }
  const target = revocationPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify([...current, receipt], null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { receipt, created: true };
}

export function createSeedRecompileReceipt(input: { adoptionFingerprint: string; targetVersionId?: string; fields: ReadonlyArray<{ field: string; value: string; version: number }>; changedFields: readonly string[]; dependencyMap: Record<string, readonly string[]> }): SeedRecompileReceipt {
  if (!input.adoptionFingerprint.trim() || !input.fields.length || !input.changedFields.length) throw new Error("SEED_RECOMPILE_FIELDS_REQUIRED");
  const result = recompileSeedIncrementally(input);
  const identity = { adoptionFingerprint: input.adoptionFingerprint, targetVersionId: input.targetVersionId?.trim() || "unversioned", changedFields: [...new Set(input.changedFields)], recompiledFields: result.recompiled, preservedFields: result.preserved };
  const base = { schemaVersion: "seed-recompile-receipt.v1" as const, ...identity, rollbackPoint: `rollback-seed-recompile-${hash(identity).slice(0, 20)}`, status: "completed" as const };
  return { ...base, fingerprint: hash(base) };
}

export function assertSeedRecompileReceiptIntegrity(value: unknown): asserts value is SeedRecompileReceipt {
  if (!value || typeof value !== "object") throw new Error("SEED_RECOMPILE_RECEIPT_INTEGRITY_FAILED");
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== "seed-recompile-receipt.v1" || typeof receipt.adoptionFingerprint !== "string" || !receipt.adoptionFingerprint.trim() || typeof receipt.targetVersionId !== "string" || !receipt.targetVersionId.trim() || !Array.isArray(receipt.changedFields) || !Array.isArray(receipt.recompiledFields) || !Array.isArray(receipt.preservedFields) || typeof receipt.rollbackPoint !== "string" || !receipt.rollbackPoint.trim() || receipt.status !== "completed" || typeof receipt.fingerprint !== "string" || [...receipt.changedFields, ...receipt.recompiledFields, ...receipt.preservedFields].some((item) => typeof item !== "string" || !item.trim())) throw new Error("SEED_RECOMPILE_RECEIPT_INTEGRITY_FAILED");
  const { fingerprint, ...base } = receipt;
  if (hash(base) !== fingerprint) throw new Error("SEED_RECOMPILE_RECEIPT_INTEGRITY_FAILED");
}

export async function readSeedRecompileReceipts(root: string): Promise<SeedRecompileReceipt[]> {
  let raw: string;
  try { raw = await fs.readFile(recompilePath(root), "utf8"); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("SEED_RECOMPILE_RECEIPT_INTEGRITY_FAILED"); }
  if (!Array.isArray(parsed)) throw new Error("SEED_RECOMPILE_RECEIPT_INTEGRITY_FAILED");
  for (const item of parsed) assertSeedRecompileReceiptIntegrity(item);
  return parsed as SeedRecompileReceipt[];
}

export async function persistSeedRecompileReceipt(root: string, receipt: SeedRecompileReceipt): Promise<{ receipt: SeedRecompileReceipt; created: boolean }> {
  assertSeedRecompileReceiptIntegrity(receipt);
  const current = await readSeedRecompileReceipts(root);
  const existing = current.find((item) => item.adoptionFingerprint === receipt.adoptionFingerprint && item.changedFields.join("|") === receipt.changedFields.join("|"));
  if (existing) {
    if (existing.fingerprint !== receipt.fingerprint) throw new Error("SEED_RECOMPILE_RECEIPT_IDEMPOTENCY_CONFLICT");
    return { receipt: existing, created: false };
  }
  const target = recompilePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify([...current, receipt], null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { receipt, created: true };
}
