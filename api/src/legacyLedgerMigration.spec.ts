import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createLegacyLedgerMigrationReceipt, findUnmigratedLegacyLedgerIds, listLegacyLedgerMigrations, persistLegacyLedgerMigration } from "./legacyLedgerMigration.js";

describe("legacy ledger migration receipts", () => {
  it("requires evidence and only treats a receipt as migrated when its obligation exists", () => {
    expect(() => createLegacyLedgerMigrationReceipt({ legacyId: "legacy-1", obligationId: "obligation-1", evidenceRefs: [], confirmer: "author", reason: "migrate" })).toThrow("LEGACY_LEDGER_MIGRATION_FIELDS_REQUIRED");
    const receipt = createLegacyLedgerMigrationReceipt({ legacyId: "legacy-1", obligationId: "obligation-1", evidenceRefs: ["chapter://1#1"], confirmer: "author", reason: "migrate" });
    expect(findUnmigratedLegacyLedgerIds({ legacyIds: ["legacy-1", "legacy-2"], receipts: [receipt], obligationIds: ["obligation-1"] })).toEqual(["legacy-2"]);
    expect(findUnmigratedLegacyLedgerIds({ legacyIds: ["legacy-1"], receipts: [receipt], obligationIds: [] })).toEqual(["legacy-1"]);
  });

  it("persists append-only migration receipts idempotently and rejects remapping", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-ledger-migration-"));
    const receipt = createLegacyLedgerMigrationReceipt({ legacyId: "legacy-1", obligationId: "obligation-1", evidenceRefs: ["chapter://1#1"], confirmer: "author", reason: "migrate" });
    await expect(persistLegacyLedgerMigration(root, receipt)).resolves.toMatchObject({ created: true });
    await expect(persistLegacyLedgerMigration(root, receipt)).resolves.toMatchObject({ created: false });
    const conflictBase = { ...receipt, obligationId: "obligation-2" };
    const { fingerprint: _oldFingerprint, ...conflictWithoutFingerprint } = conflictBase;
    const conflict = { ...conflictWithoutFingerprint, fingerprint: crypto.createHash("sha256").update(JSON.stringify(conflictWithoutFingerprint)).digest("hex") };
    await expect(persistLegacyLedgerMigration(root, conflict)).rejects.toThrow("LEGACY_LEDGER_MIGRATION_CONFLICT");
  });

  it("fails closed when an append-only receipt is re-signed with invalid evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-ledger-migration-tamper-"));
    const receipt = createLegacyLedgerMigrationReceipt({ legacyId: "legacy-1", obligationId: "obligation-1", evidenceRefs: ["chapter://1#1"], confirmer: "author", reason: "migrate" });
    await persistLegacyLedgerMigration(root, receipt);
    const target = path.join(root, "sessions", "obligations", "legacy-ledger-migrations.jsonl");
    const { fingerprint: _fingerprint, ...base } = receipt;
    const forgedBase = { ...base, evidenceRefs: [""] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    await fs.writeFile(target, `${JSON.stringify(forged)}\n`, "utf8");
    await expect(listLegacyLedgerMigrations(root)).rejects.toThrow("LEGACY_LEDGER_MIGRATION_INTEGRITY_FAILED");
  });
});
