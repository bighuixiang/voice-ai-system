import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordReleaseE2EAcceptance, readReleaseE2EAcceptance } from "./releaseE2EAcceptance.js";

const roots: string[] = [];
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("governed release E2E evidence", () => {
  it("issues a durable proof only after committed settlement and derived publication", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "derived-publications"), { recursive: true });
    const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1-adopt-1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    const settlement = { ...settlementBase, fingerprint: hash(settlementBase) };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${settlement.settlementId}.json`), JSON.stringify(settlement), "utf8");
    const derivedBase = { schemaVersion: "derived-publication-transaction.v1", transactionId: "derived-1", projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes: [{ relativePath: "derived/summary.json", contentSha256: "b".repeat(64) }], status: "committed", createdAt: new Date().toISOString(), committedAt: new Date().toISOString() };
    const derived = { ...derivedBase, fingerprint: hash(derivedBase) };
    await fs.writeFile(path.join(root, "sessions", "derived-publications", "derived-1.json"), JSON.stringify(derived), "utf8");

    const proof = await recordReleaseE2EAcceptance(root, { projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, derivedTransactionId: derived.transactionId });
    expect(proof).toMatchObject({ schemaVersion: "release-e2e-acceptance.v1", status: "verified", settlementId: settlement.settlementId, derivedTransactionId: derived.transactionId });
    expect(await readReleaseE2EAcceptance(root)).toEqual(proof);
    await expect(recordReleaseE2EAcceptance(root, { projectSlug: "other-project", chapterId: "c1", settlementId: settlement.settlementId, derivedTransactionId: derived.transactionId })).rejects.toThrow("RELEASE_E2E_PROOF_CONFLICT");
  });

  it("fails closed when the derived transaction is not committed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-")); roots.push(root);
    await expect(recordReleaseE2EAcceptance(root, { projectSlug: "demo", chapterId: "c1", settlementId: "missing", derivedTransactionId: "missing" })).rejects.toThrow("RELEASE_E2E_SETTLEMENT_REQUIRED");
  });

  it("rejects a settlement whose persisted fingerprint was tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    const settlement = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-tampered", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString(), fingerprint: "f".repeat(64) };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-tampered.json"), JSON.stringify(settlement), "utf8");
    await expect(recordReleaseE2EAcceptance(root, { projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, derivedTransactionId: "missing" })).rejects.toThrow("RELEASE_E2E_SETTLEMENT_INTEGRITY_FAILED");
  });

  it("fails closed when an existing release proof is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const proof = {
      schemaVersion: "release-e2e-acceptance.v1", status: "verified", projectSlug: "demo", chapterId: "c1",
      settlementId: "settlement-1", derivedTransactionId: "derived-1", settlementFingerprint: "a".repeat(64), derivedFingerprint: "b".repeat(64),
      verifiedAt: new Date().toISOString(), fingerprint: "f".repeat(64)
    };
    await fs.writeFile(path.join(root, "sessions", "release-e2e-acceptance.json"), JSON.stringify(proof), "utf8");
    await expect(recordReleaseE2EAcceptance(root, { projectSlug: "demo", chapterId: "c1", settlementId: "settlement-1", derivedTransactionId: "derived-1" })).rejects.toThrow("RELEASE_E2E_PROOF_INTEGRITY_FAILED");
  });

  it("fails closed when a release proof has a valid hash but an invalid terminal status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = {
      schemaVersion: "release-e2e-acceptance.v1", status: "rejected", projectSlug: "demo", chapterId: "c1",
      settlementId: "settlement-1", derivedTransactionId: "derived-1", settlementFingerprint: "a".repeat(64), derivedFingerprint: "b".repeat(64),
      verifiedAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(root, "sessions", "release-e2e-acceptance.json"), JSON.stringify({ ...base, fingerprint: hash(base) }));
    await expect(readReleaseE2EAcceptance(root)).rejects.toThrow("RELEASE_E2E_PROOF_INTEGRITY_FAILED");
  });

  it("rejects a proof when its referenced settlement is replaced after acceptance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "release-e2e-stale-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "derived-publications"), { recursive: true });
    const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-stale", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    const settlement = { ...settlementBase, fingerprint: hash(settlementBase) };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-stale.json"), JSON.stringify(settlement), "utf8");
    const derivedBase = { schemaVersion: "derived-publication-transaction.v1", transactionId: "derived-stale", projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes: [{ relativePath: "derived/summary.json", contentSha256: "b".repeat(64) }], status: "committed", createdAt: new Date().toISOString(), committedAt: new Date().toISOString() };
    const derived = { ...derivedBase, fingerprint: hash(derivedBase) };
    await fs.writeFile(path.join(root, "sessions", "derived-publications", "derived-stale.json"), JSON.stringify(derived), "utf8");
    await recordReleaseE2EAcceptance(root, { projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, derivedTransactionId: derived.transactionId });
    const replacedBase = { ...settlementBase, adoptedContentSha256: "c".repeat(64) };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-stale.json"), JSON.stringify({ ...replacedBase, fingerprint: hash(replacedBase) }), "utf8");
    await expect(readReleaseE2EAcceptance(root)).rejects.toThrow("RELEASE_E2E_PROOF_STALE");
  });
});
