import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueClosureCertificate, assertClosureCertificateCurrent, readClosureCertificate } from "./closureCertificate.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function fixture(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "closure-certificate-"));
}

async function seed(root: string): Promise<void> {
  const settlementBase = {
    schemaVersion: "chapter-settlement.v1",
    settlementId: "settlement-c1",
    projectSlug: "demo",
    chapterId: "c1",
    adoptionTransactionId: "adoption-c1",
    adoptedContentSha256: "a".repeat(64),
    status: "settled",
    nextAction: "schedule_dependency_ready_work",
    createdAt: new Date().toISOString()
  };
  await fs.mkdir(path.join(root, "sessions/chapter-settlements"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions/chapter-settlements/settlement-c1.json"), JSON.stringify({ ...settlementBase, fingerprint: hash(settlementBase) }));
  await fs.mkdir(path.join(root, "sessions/obligations"), { recursive: true });
  const coverageBase = {
    schemaVersion: "obligation-coverage-certificate.v1",
    status: "issued",
    sourceFingerprint: "source-1",
    chapterIds: ["c1"],
    plannedIds: [],
    obligationCount: 0,
    terminalObligationIds: [],
    generatedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(root, "sessions/obligations/coverage-certificate.json"), JSON.stringify({ ...coverageBase, fingerprint: hash(coverageBase) }));
}

describe("closure certificate", () => {
  it("blocks when a required chapter settlement is missing", async () => {
    const root = await fixture();
    await seed(root);
    await fs.rm(path.join(root, "sessions/chapter-settlements/settlement-c1.json"));
    await expect(issueClosureCertificate(root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "source-1" })).rejects.toThrow("CLOSURE_CHAPTER_SETTLEMENT_REQUIRED");
  });

  it("issues a replayable complete certificate and rejects a changed source", async () => {
    const root = await fixture();
    await seed(root);
    const certificate = await issueClosureCertificate(root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "source-1" });
    expect(certificate).toMatchObject({ schemaVersion: "closure-certificate.v1", status: "audited_complete", chapterIds: ["c1"], settlementIds: ["settlement-c1"] });
    await expect(assertClosureCertificateCurrent(root, "source-2")).rejects.toThrow("CLOSURE_CERTIFICATE_STALE");
    await expect(assertClosureCertificateCurrent(root, "source-1")).resolves.toMatchObject({ valid: true });
    const target = path.join(root, "sessions/closure/closure-certificate.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.projectSlug = "tampered";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readClosureCertificate(root)).rejects.toThrow("CLOSURE_CERTIFICATE_STALE");
    await expect(issueClosureCertificate(root, { projectSlug: "demo", chapterIds: ["c1"], sourceFingerprint: "source-1" })).rejects.toThrow("CLOSURE_CERTIFICATE_STALE");
    await expect(assertClosureCertificateCurrent(root, "source-1")).rejects.toThrow("CLOSURE_CERTIFICATE_STALE");
  });
});
