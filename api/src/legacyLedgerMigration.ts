import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface LegacyLedgerMigrationReceipt {
  schemaVersion: "legacy-ledger-migration-receipt.v1";
  legacyId: string;
  obligationId: string;
  evidenceRefs: string[];
  confirmer: string;
  reason: string;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const receiptPath = (root: string) => resolveInside(root, "sessions/obligations/legacy-ledger-migrations.jsonl");

export function createLegacyLedgerMigrationReceipt(input: Omit<LegacyLedgerMigrationReceipt, "schemaVersion" | "createdAt" | "fingerprint">): LegacyLedgerMigrationReceipt {
  if (!input.legacyId.trim() || !input.obligationId.trim() || !input.confirmer.trim() || !input.reason.trim() || !input.evidenceRefs.length) throw new Error("LEGACY_LEDGER_MIGRATION_FIELDS_REQUIRED");
  const base = { schemaVersion: "legacy-ledger-migration-receipt.v1" as const, legacyId: input.legacyId.trim(), obligationId: input.obligationId.trim(), evidenceRefs: [...new Set(input.evidenceRefs.map(String))].sort(), confirmer: input.confirmer.trim(), reason: input.reason.trim(), createdAt: new Date().toISOString() };
  return { ...base, fingerprint: hash(base) };
}

export function assertLegacyLedgerMigrationIntegrity(receipt: LegacyLedgerMigrationReceipt): LegacyLedgerMigrationReceipt {
  const { fingerprint: _fingerprint, ...base } = receipt;
  const valid = receipt?.schemaVersion === "legacy-ledger-migration-receipt.v1" && [receipt.legacyId, receipt.obligationId, receipt.confirmer, receipt.reason, receipt.createdAt].every((value) => typeof value === "string" && value.trim()) && Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0 && receipt.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim()) && !Number.isNaN(Date.parse(receipt.createdAt)) && /^[a-f0-9]{64}$/i.test(receipt.fingerprint) && hash(base) === receipt.fingerprint;
  if (!valid) throw new Error("LEGACY_LEDGER_MIGRATION_INTEGRITY_FAILED");
  return receipt;
}

export async function persistLegacyLedgerMigration(root: string, receipt: LegacyLedgerMigrationReceipt): Promise<{ created: boolean; receipt: LegacyLedgerMigrationReceipt }> {
  assertLegacyLedgerMigrationIntegrity(receipt);
  const target = receiptPath(root);
  let existing: LegacyLedgerMigrationReceipt[] = [];
  try {
    existing = (await fs.readFile(target, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => assertLegacyLedgerMigrationIntegrity(JSON.parse(line) as LegacyLedgerMigrationReceipt));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  const sameLegacy = existing.find((item) => item.legacyId === receipt.legacyId);
  if (sameLegacy) {
    if (sameLegacy.fingerprint === receipt.fingerprint) return { created: false, receipt: sameLegacy };
    throw new Error("LEGACY_LEDGER_MIGRATION_CONFLICT");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(receipt)}\n`, "utf8");
  return { created: true, receipt };
}

export async function listLegacyLedgerMigrations(root: string): Promise<LegacyLedgerMigrationReceipt[]> {
  try {
    return (await fs.readFile(receiptPath(root), "utf8")).split(/\r?\n/).filter(Boolean).map((line) => assertLegacyLedgerMigrationIntegrity(JSON.parse(line) as LegacyLedgerMigrationReceipt));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export function findUnmigratedLegacyLedgerIds(input: { legacyIds: string[]; receipts: LegacyLedgerMigrationReceipt[]; obligationIds: string[] }): string[] {
  const obligations = new Set(input.obligationIds);
  const migrated = new Set(input.receipts.filter((receipt) => obligations.has(receipt.obligationId)).map((receipt) => receipt.legacyId));
  return [...new Set(input.legacyIds)].filter((id) => !migrated.has(id)).sort();
}
