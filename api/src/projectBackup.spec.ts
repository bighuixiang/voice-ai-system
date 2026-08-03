import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectBackup, listProjectBackups, readBackupVerification, readProjectBackup, verifyProjectBackup } from "./projectBackup.js";
import { readRestoreDrill, runRestoreDrill } from "./restoreDrill.js";
import { readRecoverySettlement, settleRecovery } from "./recoverySettlement.js";
import { createRestorePlan } from "./restorePlan.js";
import { assessBackupDurability, readBackupPolicy, saveBackupPolicy } from "./backupPolicy.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("project backup manifest", () => {
  it("creates a verified local project-tree manifest without recursively backing up backups", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "backups", "old"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), "{\"slug\":\"demo\"}\n");
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "draft\n");
    await fs.writeFile(path.join(root, "sessions", "backups", "old", "manifest.json"), "old\n");

    const manifest = await createProjectBackup(root, "demo");

    expect(manifest.status).toBe("verified");
    expect(manifest.faultDomain).toBe("same-workspace");
    expect(manifest.objects.map((item) => item.relativePath)).toEqual(["chapters/chapter-001.md", "project.json"]);
    expect(await readProjectBackup(root, manifest.backupId)).toEqual(manifest);
    await expect(verifyProjectBackup(root, manifest.backupId)).resolves.toMatchObject({ status: "verified", checked: 2, failures: [] });
    await expect(readBackupVerification(root, manifest.backupId)).resolves.toMatchObject({ status: "verified", manifestFingerprint: manifest.fingerprint, checked: 2 });
  });

  it("reports tampered backup objects instead of claiming verification", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-tamper-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    const object = manifest.objects[0]!;
    await fs.writeFile(path.join(root, "sessions", "backups", manifest.backupId, "objects", object.relativePath), "tampered\n");

    await expect(verifyProjectBackup(root, manifest.backupId)).resolves.toMatchObject({ status: "failed", failures: ["project.json"] });
    await expect(readBackupVerification(root, manifest.backupId)).resolves.toMatchObject({ status: "failed", failures: ["project.json"] });
  });

  it("rejects a verification receipt when its manifest has advanced", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-verification-stale-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    await verifyProjectBackup(root, manifest.backupId);
    const manifestFile = path.join(root, "sessions", "backups", manifest.backupId, "manifest.json");
    const advanced = JSON.parse(await fs.readFile(manifestFile, "utf8")) as Record<string, unknown>;
    const base = { ...advanced, createdAt: "2027-01-01T00:00:00.000Z" }; delete base.fingerprint;
    await fs.writeFile(manifestFile, JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }), "utf8");
    await expect(readBackupVerification(root, manifest.backupId)).rejects.toThrow("BACKUP_VERIFICATION_STALE");
  });

  it("rejects a previously verified receipt when an object changes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-verification-object-stale-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    await verifyProjectBackup(root, manifest.backupId);
    await fs.writeFile(path.join(root, "sessions", "backups", manifest.backupId, "objects", "project.json"), "tampered-after-verify\n");
    await expect(readBackupVerification(root, manifest.backupId)).rejects.toThrow("BACKUP_VERIFICATION_STALE");
  });

  it("rejects a tampered manifest before trusting its object claims", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-manifest-tamper-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    const manifestFile = path.join(root, "sessions", "backups", manifest.backupId, "manifest.json");
    const tampered = JSON.parse(await fs.readFile(manifestFile, "utf8")) as Record<string, unknown>;
    tampered.sourceFingerprint = "forged";
    await fs.writeFile(manifestFile, JSON.stringify(tampered), "utf8");
    await expect(readProjectBackup(root, manifest.backupId)).rejects.toThrow("PROJECT_BACKUP_MANIFEST_INTEGRITY_FAILED");
    await expect(verifyProjectBackup(root, manifest.backupId)).rejects.toThrow("PROJECT_BACKUP_MANIFEST_INTEGRITY_FAILED");
  });

  it("fails closed when a re-signed manifest contains a traversal object path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-path-tamper-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    const manifestFile = path.join(root, "sessions", "backups", manifest.backupId, "manifest.json");
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(manifestFile, "utf8")) as Record<string, unknown>;
    const objects = base.objects as Array<Record<string, unknown>>;
    const resigned = { ...base, objects: [{ ...objects[0], relativePath: "../outside.txt" }] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(manifestFile, JSON.stringify(resigned), "utf8");
    await expect(readProjectBackup(root, manifest.backupId)).rejects.toThrow("PROJECT_BACKUP_MANIFEST_INTEGRITY_FAILED");
  });

  it("lists only discoverable backups for the requested project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-catalog-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    const first = await createProjectBackup(root, "demo");
    const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-other-"));
    roots.push(otherRoot);
    await fs.writeFile(path.join(otherRoot, "project.json"), "other\n");
    await createProjectBackup(otherRoot, "other");

    const catalog = await listProjectBackups(root, "demo");

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ backupId: first.backupId, projectSlug: "demo", status: "verified", faultDomain: "same-workspace", objectCount: 1 });
  });

  it("rejects a source tree that changes during capture", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-source-change-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    process.env.NOVEL_BACKUP_INJECT_SOURCE_CHANGE = "1";
    await expect(createProjectBackup(root, "demo")).rejects.toThrow("PROJECT_BACKUP_SOURCE_CHANGED");
    delete process.env.NOVEL_BACKUP_INJECT_SOURCE_CHANGE;
    await expect(fs.readdir(path.join(root, "sessions", "backups"))).resolves.toEqual([]);
  });

  it("rebuilds a backup only in an isolated workspace and records no-side-effect evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "restore-drill-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "chapter\n");
    const backup = await createProjectBackup(root, "demo");
    const receipt = await runRestoreDrill(root, "demo", backup.backupId);
    expect(receipt).toMatchObject({ status: "verified", workerStarted: false, externalMessagesSent: false, checked: 2 });
    expect(await fs.readFile(path.join(root, "sessions", "restore-drills", receipt.drillId, "workspace", "project.json"), "utf8")).toBe("demo\n");
    expect(await readRestoreDrill(root, receipt.drillId)).toEqual(receipt);
  });

  it("fails the isolated drill on a corrupted backup without touching the source tree", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "restore-drill-corrupt-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    const backup = await createProjectBackup(root, "demo");
    await fs.writeFile(path.join(root, "sessions", "backups", backup.backupId, "objects", "project.json"), "tampered\n");
    const receipt = await runRestoreDrill(root, "demo", backup.backupId);
    expect(receipt.status).toBe("failed");
    expect(receipt.failures).toEqual(["project.json"]);
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe("demo\n");
  });

  it("requires verified drill evidence and author confirmation before recovery settlement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "recovery-settlement-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    const backup = await createProjectBackup(root, "demo");
    const drill = await runRestoreDrill(root, "demo", backup.backupId);
    const plan = await createRestorePlan({ root, projectSlug: "demo", backupId: backup.backupId, mode: "new_project", targetWorkspace: "recovery-target" });
    await expect(settleRecovery({ root, projectSlug: "demo", backupId: backup.backupId, drillId: drill.drillId, planId: plan.planId, mode: "new_project", authorConfirmation: "", expectedSourceFingerprint: drill.sourceFingerprint })).rejects.toThrow("RECOVERY_AUTHOR_CONFIRMATION_REQUIRED");
    const settlement = await settleRecovery({ root, projectSlug: "demo", backupId: backup.backupId, drillId: drill.drillId, planId: plan.planId, mode: "new_project", authorConfirmation: "author-confirmed-isolated-restore", expectedSourceFingerprint: drill.sourceFingerprint });
    expect(settlement).toMatchObject({ status: "settled", appliedToProduction: false, drillFingerprint: drill.fingerprint, planFingerprint: plan.fingerprint });
    expect(await readRecoverySettlement(root, settlement.settlementId)).toEqual(settlement);
  });

  it("makes backup durability policy explicit and marks same-workspace-only copies degraded", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "backup-policy-"));
    roots.push(root);
    const policy = await saveBackupPolicy(root, { projectSlug: "demo", trigger: "automatic", maxRpoMinutes: 30, targetRtoMinutes: 60, minimumCopies: 2, faultDomains: ["same-workspace", "object-store"], externalCopyRequired: true, maxUnverifiedAgeMinutes: 1440 });
    expect(await readBackupPolicy(root)).toEqual(policy);
    expect(assessBackupDurability(policy, { faultDomain: "same-workspace", createdAt: new Date().toISOString() })).toMatchObject({ status: "degraded", reasons: expect.arrayContaining(["BACKUP_EXTERNAL_COPY_REQUIRED", "BACKUP_FAULT_DOMAIN_COVERAGE_INSUFFICIENT"]) });
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    const backup = await createProjectBackup(root, "demo");
    expect(backup).toMatchObject({ policyFingerprint: policy.fingerprint, durabilityStatus: "degraded" });
  });
});
