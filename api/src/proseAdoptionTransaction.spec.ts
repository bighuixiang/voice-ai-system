import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProseCanon, readProseCanon } from "./proseAdoptionTransaction.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "prose-transaction-")); }
const base = (root: string) => ({ root, projectSlug: "demo", segmentId: "segment-1", baselineFingerprint: "base-1", currentText: "旧正文", maturity: "validated" as const, authorLockIds: ["lock-1"], sourceRefs: ["candidate://1"] });
describe("atomic prose adoption transaction", () => {
  it("commits exact segment change and records rollback/derivatives", async () => { const r = await root(); const result = await createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "新正文", authority: "author", lockCheckPassed: true, validationFingerprint: "validation-1", derivedCandidates: ["fact-candidate-1"] }); expect(result.status).toBe("committed"); expect(result.canon.text).toBe("新正文"); expect(result.transaction.rollbackVersion).toBe("旧正文"); expect((await readProseCanon(r, "segment-1"))?.text).toBe("新正文"); });
  it("blocks stale baseline, failed lock, and unauthorized mature prose without writing", async () => { const r = await root(); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "stale", replacementText: "x", authority: "author", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_BASELINE_STALE"); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "x", authority: "author", lockCheckPassed: false, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_LOCK_CHECK_FAILED"); await expect(createProseCanon({ ...base(r), maturity: "settled" }, { expectedBaselineFingerprint: "base-1", replacementText: "x", authority: "autonomous", lockCheckPassed: true, validationFingerprint: "v", derivedCandidates: [] })).rejects.toThrow("PROSE_AUTHOR_AUTHORITY_REQUIRED"); expect(await readProseCanon(r, "segment-1")).toBeNull(); });
  it("requires validation and evidence", async () => { const r = await root(); await expect(createProseCanon(base(r), { expectedBaselineFingerprint: "base-1", replacementText: "", authority: "author", lockCheckPassed: true, validationFingerprint: "", derivedCandidates: [] })).rejects.toThrow("PROSE_TRANSACTION_VALIDATION_REQUIRED"); });
});
