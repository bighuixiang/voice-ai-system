import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertProseAdoptionTransactionIntegrity, createProseCanon, readProseAdoptionTransaction, readProseCanon } from "./proseAdoptionTransaction.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "prose-transaction-")); }
const base = (root: string) => ({ root, projectSlug: "demo", segmentId: "segment-1", baselineFingerprint: "base-1", currentText: "旧正文", maturity: "validated" as const, authorLockIds: ["lock-1"], sourceRefs: ["candidate://1"] });
describe("atomic prose adoption transaction", () => {
  it("commits exact segment change and records rollback/derivatives", async () => { const r = await root(); const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "新正文", authority: "author", lockCheckPassed: true, validationFingerprint: "validation-1", derivedCandidates: ["fact-candidate-1"] }); expect(result.status).toBe("committed"); expect(result.canon.text).toBe("新正文"); expect(result.transaction.rollbackVersion).toBe("旧正文"); expect((await readProseCanon(r, "segment-1"))?.text).toBe("新正文"); });
  it("blocks stale baseline, failed lock, and unauthorized mature prose without writing", async () => { const r = await root(); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "stale", replacementText: "x", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_BASELINE_STALE"); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "x", authority: "author", lockCheckPassed: false, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_LOCK_CHECK_FAILED"); await expect(createProseCanon({ ...base(r), maturity: "settled" }, { expectedBaselineFingerprint: "base-1", replacementText: "x", authority: "autonomous", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_AUTHOR_AUTHORITY_REQUIRED"); expect(await readProseCanon(r, "segment-1")).toBeNull(); });
  it("requires validation and evidence", async () => { const r = await root(); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "", authority: "author", lockCheckPassed: true, validationFingerprint: "", derivedCandidates: [] })).rejects.toThrow("PROSE_TRANSACTION_VALIDATION_REQUIRED"); });
  it("fails closed when a prose canon has a valid hash but invalid maturity", async () => { const r = await root(); const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: ["candidate://1"] }); const target = path.join(r, "sessions", "prose-canon", "segment-1.json"); const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>; tampered.maturity = "committed"; delete tampered.fingerprint; await fs.writeFile(target, JSON.stringify({ ...tampered, fingerprint: crypto.createHash("sha256").update(JSON.stringify(tampered)).digest("hex") })); await expect(readProseCanon(r, "segment-1")).rejects.toThrow("PROSE_CANON_INTEGRITY_FAILED"); expect(result.transaction.transactionId).toContain("prose-tx-segment-1"); });
  it("fails closed when a rehashed canon has empty text and an invalid timestamp", async () => {
    const r = await root();
    const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] });
    const { fingerprint: _fingerprint, ...canonBase } = result.canon;
    const forgedBase = { ...canonBase, text: "", updatedAt: "not-a-timestamp" };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    await fs.writeFile(path.join(r, "sessions", "prose-canon", "segment-1.json"), JSON.stringify(forged), "utf8");

    await expect(readProseCanon(r, "segment-1")).rejects.toThrow("PROSE_CANON_INTEGRITY_FAILED");
  });
  it("requires an exact change set and refuses direct writes to mature prose", async () => {
    const r = await root();
    const tx = { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author" as const, lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [], changeSet: [{ segmentId: "segment-1", startOffset: 0, endOffset: 3, beforeFingerprint: "old", afterFingerprint: "new" }], revisionMode: "direct" as const };
    await expect(createProseCanon(base(r), { ...tx, changeSet: [] } as any)).rejects.toThrow("PROSE_CHANGE_SET_REQUIRED");
    await expect(createProseCanon({ ...base(r), maturity: "settled" }, tx as any)).rejects.toThrow("PROSE_MATURE_REVISION_ISOLATION_REQUIRED");
    const result = await createProseCanon(base(r), tx as any);
    expect(result.transaction.changeSet).toEqual(tx.changeSet);
    expect(result.transaction.revisionMode).toBe("direct");
  });
  it("audits and rejects tampered adoption transactions", async () => { const r = await root(); const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: ["candidate://1"] }); expect(await readProseAdoptionTransaction(r, result.transaction.transactionId)).toEqual(result.transaction); expect(() => assertProseAdoptionTransactionIntegrity({ ...result.transaction, authority: "autonomous" })).toThrow("PROSE_ADOPTION_TRANSACTION_INTEGRITY_FAILED"); const target = path.join(r, "sessions", "prose-adoption-transactions", `${result.transaction.transactionId}.json`); const persisted = JSON.parse(await fs.readFile(target, "utf8")); persisted.lockCheckPassed = false; await fs.writeFile(target, JSON.stringify(persisted)); await expect(readProseAdoptionTransaction(r, result.transaction.transactionId)).rejects.toThrow("PROSE_ADOPTION_TRANSACTION_INTEGRITY_FAILED"); });
  it("rejects a rehashed adoption transaction that claims a failed lock check", async () => {
    const r = await root();
    const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] });
    const { fingerprint: _fingerprint, ...transactionBase } = result.transaction;
    const forgedBase = { ...transactionBase, lockCheckPassed: false };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertProseAdoptionTransactionIntegrity(forged as typeof result.transaction)).toThrow("PROSE_ADOPTION_TRANSACTION_INTEGRITY_FAILED");
  });
  it("rejects a rehashed adoption transaction whose change set targets another segment", async () => {
    const r = await root();
    const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "new", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] });
    const { fingerprint: _fingerprint, ...transactionBase } = result.transaction;
    const forgedBase = { ...transactionBase, changeSet: [{ ...transactionBase.changeSet[0], segmentId: "segment-2" }] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };

    expect(() => assertProseAdoptionTransactionIntegrity(forged as typeof result.transaction)).toThrow("PROSE_ADOPTION_TRANSACTION_INTEGRITY_FAILED");
  });
});
