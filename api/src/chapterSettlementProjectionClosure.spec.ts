import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertChapterSettlementProjectionClosureIntegrity, recordChapterSettlementProjectionClosure, readChapterSettlementProjectionClosure } from "./chapterSettlementProjectionClosure.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settlement-closure-"));
  const base = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1-adopt-1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: "2026-07-31T00:00:00.000Z" };
  await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${base.settlementId}.json`), JSON.stringify({ ...base, fingerprint: hash(base) }), "utf8");
  return root;
}

describe("chapter settlement projection closure", () => {
  it("records an immutable post-settlement projection closure and replays idempotently", async () => {
    const root = await fixture();
    const closure = await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) });
    expect(closure).toMatchObject({ schemaVersion: "chapter-settlement-projection-closure.v1", status: "closed", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1" });
    await expect(recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) })).resolves.toEqual(closure);
    await expect(readChapterSettlementProjectionClosure(root, closure.closureId)).resolves.toEqual(closure);
  });

  it("fails closed for a missing or tampered settlement", async () => {
    const root = await fixture();
    await expect(recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c2", settlementId: "missing", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) })).rejects.toThrow("SETTLEMENT_PROJECTION_CLOSURE_SETTLEMENT_REQUIRED");
    const closure = await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) });
    const target = path.join(root, "sessions", "chapter-settlement-projection-closures", `${closure.closureId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.derivedTransactionId = "tampered";
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    await expect(readChapterSettlementProjectionClosure(root, closure.closureId)).rejects.toThrow("SETTLEMENT_PROJECTION_CLOSURE_INTEGRITY_FAILED");
  });
  it("rejects a re-signed closure with conflicting project scope", async () => {
    const root = await fixture();
    const closure = await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) });
    const target = path.join(root, "sessions", "chapter-settlement-projection-closures", `${closure.closureId}.json`);
    const { fingerprint: _old, ...base } = closure;
    const resigned = { ...base, projectSlug: "other", fingerprint: hash({ ...base, projectSlug: "other" }) };
    await fs.writeFile(target, JSON.stringify(resigned));
    await expect(recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) })).rejects.toThrow("SETTLEMENT_PROJECTION_CLOSURE_CONFLICT");
  });
  it("exposes the same closure integrity boundary for direct audits", async () => { const root = await fixture(); const closure = await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "settlement-c1-adopt-1", derivedTransactionId: "derived-2", derivedFingerprint: "c".repeat(64) }); expect(assertChapterSettlementProjectionClosureIntegrity(closure, closure.closureId)).toEqual(closure); });
});
