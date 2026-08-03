import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSourceMaterialRecord, classifySourceEligibility, readSourceMaterialRecord } from "./sourceMaterial.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "source-material-")); }
const input = (root: string) => ({ root, projectSlug: "demo", platform: "public-web", stableLocator: "https://example.com/article", capturedAt: "2026-07-30T00:00:00.000Z", contentFingerprint: "a".repeat(64), sourceFamily: "interview", accessClass: "public" as const, processingPurpose: "extract craft mechanism", retainableEvidenceScope: "short structural summary", projectScope: "demo", platformScope: "workbench", refreshPolicy: "monthly", expiresAt: "2026-08-30T00:00:00.000Z", deletionPolicy: "delete on expiry", sourceRefs: ["https://example.com/article"] });
describe("source material record", () => {
  it("stores complete provenance and classifies public material", async () => { const record = await createSourceMaterialRecord(input(await root())); expect(record.eligibility).toBe("default_allowed"); expect(record.contentFingerprint).toHaveLength(64); });
  it("keeps private/restricted/unknown material isolated from default context", async () => { const r = await root(); const record = await createSourceMaterialRecord({ ...input(r), accessClass: "restricted", processingPurpose: "analyze" }); expect(record.eligibility).toBe("analysis_only"); expect(classifySourceEligibility({ accessClass: "unknown", retainableEvidenceScope: "" })).toBe("analysis_only"); });
  it("is idempotent and requires stable locator/fingerprint/lifecycle fields", async () => { const r = await root(); const one = await createSourceMaterialRecord(input(r)); const two = await createSourceMaterialRecord({ ...input(r), processingPurpose: "changed" }); expect(two.fingerprint).toBe(one.fingerprint); await expect(createSourceMaterialRecord({ ...input(r), stableLocator: "" })).rejects.toThrow("SOURCE_LOCATOR_REQUIRED"); await expect(createSourceMaterialRecord({ ...input(r), contentFingerprint: "bad" })).rejects.toThrow("SOURCE_FINGERPRINT_REQUIRED"); expect(await readSourceMaterialRecord(r, one.recordId)).toEqual(one); });
  it("rejects blank provenance anchors and invalid capture windows, and fails closed on tampering", async () => {
    const r = await root();
    await expect(createSourceMaterialRecord({ ...input(r), sourceRefs: [" "] })).rejects.toThrow("SOURCE_EVIDENCE_REQUIRED");
    await expect(createSourceMaterialRecord({ ...input(r), capturedAt: "not-a-date" })).rejects.toThrow("SOURCE_CAPTURED_AT_INVALID");
    await expect(createSourceMaterialRecord({ ...input(r), expiresAt: "2026-07-01T00:00:00.000Z" })).rejects.toThrow("SOURCE_EXPIRY_INVALID");
    const record = await createSourceMaterialRecord(input(r));
    const target = path.join(r, "sessions", "source-material", `${record.recordId}.json`);
    const tampered = { ...JSON.parse(await fs.readFile(target, "utf8")), processingPurpose: "changed" };
    await fs.writeFile(target, JSON.stringify(tampered));
    await expect(readSourceMaterialRecord(r, record.recordId)).rejects.toThrow("SOURCE_RECORD_INTEGRITY_FAILED");
    const validHash = crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
    expect(validHash).toHaveLength(64);
  });

  it("fails closed when a re-signed record expires before capture", async () => {
    const r = await root();
    const record = await createSourceMaterialRecord(input(r));
    const target = path.join(r, "sessions", "source-material", `${record.recordId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const resigned = { ...base, expiresAt: "2026-07-01T00:00:00.000Z" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned));
    await expect(readSourceMaterialRecord(r, record.recordId)).rejects.toThrow("SOURCE_RECORD_INTEGRITY_FAILED");
  });
});
