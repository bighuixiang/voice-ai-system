import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertCraftRevocationPropagationIntegrity, type CraftRevocationPropagationResult } from "./craftRevocationPropagation.js";

export interface CraftRevocationRecord {
  schemaVersion: "craft-revocation-record.v1";
  revocationId: string;
  projectSlug: string;
  propagation: CraftRevocationPropagationResult;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const file = (root: string, id: string) => resolveInside(root, `sessions/craft-revocations/${id}.json`);

export function assertCraftRevocationRecordIntegrity(record: CraftRevocationRecord, expectedId?: string): CraftRevocationRecord {
  const { fingerprint, ...base } = record;
  const valid = record.schemaVersion === "craft-revocation-record.v1" && (!expectedId || record.revocationId === expectedId) && record.revocationId.trim() && record.projectSlug.trim() && Number.isFinite(Date.parse(record.createdAt));
  if (!valid) throw new Error("CRAFT_REVOCATION_RECORD_INVALID");
  assertCraftRevocationPropagationIntegrity(record.propagation);
  if (!/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("CRAFT_REVOCATION_RECORD_INTEGRITY_FAILED");
  return record;
}

export async function readCraftRevocationRecord(root: string, revocationId: string): Promise<CraftRevocationRecord | null> {
  try { return assertCraftRevocationRecordIntegrity(JSON.parse(await fs.readFile(file(root, revocationId), "utf8")) as CraftRevocationRecord, revocationId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function listCraftRevocationRecords(root: string, projectSlug: string): Promise<CraftRevocationRecord[]> {
  if (!projectSlug.trim()) throw new Error("CRAFT_REVOCATION_PROJECT_REQUIRED");
  let names: string[];
  try { names = await fs.readdir(resolveInside(root, "sessions/craft-revocations")); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const values = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readCraftRevocationRecord(root, name.slice(0, -5))));
  return values.filter((value): value is CraftRevocationRecord => Boolean(value && value.projectSlug === projectSlug));
}

export async function persistCraftRevocationRecord(root: string, input: { projectSlug: string; propagation: CraftRevocationPropagationResult }): Promise<CraftRevocationRecord> {
  assertCraftRevocationPropagationIntegrity(input.propagation);
  if (!input.projectSlug.trim()) throw new Error("CRAFT_REVOCATION_PROJECT_REQUIRED");
  const revocationId = input.propagation.eventId;
  const existing = await readCraftRevocationRecord(root, revocationId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug) throw new Error("CRAFT_REVOCATION_PROJECT_MISMATCH");
    return existing;
  }
  const base = { schemaVersion: "craft-revocation-record.v1" as const, revocationId, projectSlug: input.projectSlug, propagation: input.propagation, createdAt: new Date().toISOString() };
  const record: CraftRevocationRecord = { ...base, fingerprint: hash(base) };
  const target = file(root, revocationId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return record;
}
