import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertBookRunInvalidationIntegrity, readBookRunInvalidation, recordBookRunInvalidation } from "./bookRunInvalidation.js";

describe("book run invalidation receipts", () => {
  it("persists an immutable, idempotent receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-invalidation-"));
    const input = { root, bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 7, reason: "completion-evidence-stale" as const, affectedArtifactRefs: ["sessions/closure", "sessions/closure"], sourceFingerprint: "canon-1" };
    const first = await recordBookRunInvalidation(input);
    const second = await recordBookRunInvalidation(input);
    expect(second).toEqual(first);
    expect(await readBookRunInvalidation(root, first.invalidationId)).toEqual(first);
  });

  it("rejects tampered receipts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-invalidation-tamper-"));
    const receipt = await recordBookRunInvalidation({ root, bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 1, reason: "completion-evidence-stale", affectedArtifactRefs: ["sessions/completion"], sourceFingerprint: "canon-1" });
    const target = path.join(root, "sessions/book-run-invalidations", `${receipt.invalidationId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.sourceFingerprint = "canon-2";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readBookRunInvalidation(root, receipt.invalidationId)).rejects.toThrow("BOOK_RUN_INVALIDATION_INTEGRITY_FAILED");
  });
  it("rejects a re-signed receipt with an empty artifact set or wrong reason", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-invalidation-semantic-")); const receipt = await recordBookRunInvalidation({ root, bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 1, reason: "completion-evidence-stale", affectedArtifactRefs: ["sessions/completion"], sourceFingerprint: "canon-1" }); const { fingerprint: _fingerprint, ...base } = receipt; const invalidBase = { ...base, reason: "other", affectedArtifactRefs: [] }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertBookRunInvalidationIntegrity(invalid as typeof receipt)).toThrow("BOOK_RUN_INVALIDATION_INTEGRITY_FAILED"); });
});
