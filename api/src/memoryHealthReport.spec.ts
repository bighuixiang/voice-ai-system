import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMemoryHealthReport, persistMemoryHealthReport, readMemoryHealthReport } from "./memoryHealthReport.js";

const roots: string[] = [];
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("memory health reports", () => {
  it("derives coverage and stale-projection risk from durable project evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-health-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.mkdir(path.join(root, "memory", "claims"), { recursive: true });
    const settlementBase = { schemaVersion: "chapter-settlement.v1", settlementId: "settlement-c1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "settlement-c1.json"), JSON.stringify({ ...settlementBase, fingerprint: hash(settlementBase) }), "utf8");
    const claimBase = { schemaVersion: "memory-claim.v1", claimId: "claim-1", proposition: "The gate is sealed", epistemicType: "canon_fact", status: "eligible", version: 2, sourceRefs: ["chapter://c1"], evidenceAnchors: ["chapter-1#1"], producedBy: "chapter-settlement", confirmer: "author", temporalScope: { asOfVersion: "c1:v1" }, confidence: 0.9, parentVersion: 1 };
    await fs.writeFile(path.join(root, "memory", "claims", "current.json"), JSON.stringify([{ ...claimBase, fingerprint: hash(claimBase) }]), "utf8");
    await fs.writeFile(path.join(root, "memory", "retcon-invalidations.jsonl"), JSON.stringify({ status: "stale-until-downstream-revalidation", claimId: "claim-old" }) + "\n", "utf8");

    const report = await buildMemoryHealthReport(root, { projectSlug: "demo", chapterIds: ["c1", "c2"] });
    expect(report).toMatchObject({ schemaVersion: "memory-health-report.v1", projectSlug: "demo", status: "degraded", coverage: { totalChapters: 2, settledChapters: 1, eligibleClaims: 1, entityCount: 0, timeBoundClaims: 0, characterKnowledgeEntries: 0, readerKnowledgeEntries: 0 }, risks: ["chapter-coverage", "stale-projection"] });
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const persisted = await persistMemoryHealthReport(root, report);
    expect(await readMemoryHealthReport(root, persisted.reportId)).toEqual(persisted);
  });

  it("fails closed when a persisted report is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-health-")); roots.push(root);
    const report = await buildMemoryHealthReport(root, { projectSlug: "demo", chapterIds: [] });
    await persistMemoryHealthReport(root, report);
    const reportPath = path.join(root, "memory", "health-reports", `${report.reportId}.json`);
    const tampered = { ...report, risks: ["fabricated"] };
    await fs.writeFile(reportPath, JSON.stringify(tampered), "utf8");
    await expect(readMemoryHealthReport(root, report.reportId)).rejects.toThrow("MEMORY_HEALTH_REPORT_INTEGRITY_FAILED");
  });

  it("marks malformed settlement evidence as blocked instead of healthy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-health-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "broken.json"), "{\"status\":\"settled\"}", "utf8");
    const report = await buildMemoryHealthReport(root, { projectSlug: "demo", chapterIds: ["c1"] });
    expect(report.status).toBe("blocked");
    expect(report.risks).toContain("settlement-integrity");
  });
});
