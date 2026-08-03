import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { cancelExecutionWorkItem, claimExecutionWorkItem, enqueueExecutionWorkItem, finishExecutionWorkItem, heartbeatExecutionWorkItem, recoverStaleExecutionWorkItems, readExecutionWorkItem, listExecutionWorkItems } from "./executionQueue.js";

const execFileAsync = promisify(execFile);

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture(withContext: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-queue-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
  await fs.mkdir(path.join(root, "sessions", "outline-candidates"), { recursive: true });
  const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-outline-candidate-demo", projectSlug: "demo", version: 1, outlineId: "outline-candidate-demo", outlineFingerprint: "outline-fp", selectedChapterIds: ["chapter-001", "chapter-002", "chapter-003"], strongFreezeCount: 3, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
  const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
  const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof", projectSlug: "demo", versionId: version.versionId, versionFingerprint: version.fingerprint, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
  const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-candidate-demo.json"), JSON.stringify(version), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-candidates", "outline-candidate-demo.json"), JSON.stringify({ fingerprint: "outline-fp" }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify(proof), "utf8");
  if (withContext) await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-1", sourceFingerprint: "context-fp" }), "utf8");
  return root;
}

describe("execution work queue", () => {
  it("queues an idempotent work item only with context and readiness evidence", async () => {
    const root = await fixture(true);
    const first = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-1");
    const second = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-1");
    expect(first).toMatchObject({ status: "queued", contextManifestId: "context-1", versionId: "outline-version-outline-candidate-demo" });
    expect(second).toEqual(first);
  });

  it("rejects a replay that changes the owning project identity", async () => {
    const root = await fixture(true);
    await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-project-conflict");
    await expect(enqueueExecutionWorkItem(root, "other-project", "chapter-001", "idem-project-conflict")).rejects.toThrow("EXECUTION_WORK_ITEM_CONFLICT");
  });

  it("persists a blocked item when the context manifest is missing", async () => {
    const root = await fixture(false);
    const item = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-2");
    expect(item).toMatchObject({ status: "blocked", blockedReason: "CONTEXT_MANIFEST_REQUIRED" });
  });

  it("fails closed when a persisted work item is tampered before claim or listing", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-integrity");
    const itemPath = path.join(root, "sessions", "execution-work-items", `${queued.workItemId}.json`);
    const tampered = JSON.parse(await fs.readFile(itemPath, "utf8")) as Record<string, unknown>;
    tampered.contextFingerprint = "tampered-context";
    await fs.writeFile(itemPath, JSON.stringify(tampered), "utf8");
    await expect(readExecutionWorkItem(root, queued.workItemId)).rejects.toThrow("EXECUTION_WORK_ITEM_INTEGRITY_FAILED");
    await expect(listExecutionWorkItems(root)).rejects.toThrow("EXECUTION_WORK_ITEM_INTEGRITY_FAILED");
    await expect(claimExecutionWorkItem(root, queued.workItemId, "run-integrity")).rejects.toThrow("EXECUTION_WORK_ITEM_INTEGRITY_FAILED");
  });

  it("claims and finishes a work item idempotently while preserving context provenance", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-3");
    const running = await claimExecutionWorkItem(root, queued.workItemId, "run-1");
    expect(running).toMatchObject({ status: "running", runId: "run-1", contextFingerprint: "context-fp" });
    expect(await claimExecutionWorkItem(root, queued.workItemId, "run-2")).toEqual(running);
    const completed = await finishExecutionWorkItem(root, queued.workItemId, { status: "completed" });
    expect(completed).toMatchObject({ status: "completed", runId: "run-1" });
    expect(await finishExecutionWorkItem(root, queued.workItemId, { status: "failed", error: "late retry" })).toEqual(completed);
  });

  it("cancels a queued work item idempotently", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-cancel");
    await expect(cancelExecutionWorkItem(root, queued.workItemId)).resolves.toMatchObject({ status: "cancelled" });
    await expect(cancelExecutionWorkItem(root, queued.workItemId)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("persists a durable heartbeat and fences finish by the owning run", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-heartbeat");
    const running = await claimExecutionWorkItem(root, queued.workItemId, "run-heartbeat");
    expect(running.heartbeatAt).toEqual(expect.any(String));
    const heartbeat = await heartbeatExecutionWorkItem(root, queued.workItemId, "run-heartbeat");
    expect(new Date(heartbeat.heartbeatAt!).getTime()).toBeGreaterThanOrEqual(new Date(running.heartbeatAt!).getTime());
    await expect(heartbeatExecutionWorkItem(root, queued.workItemId, "run-other")).rejects.toThrow("EXECUTION_WORK_ITEM_RUN_FENCE");
    await expect(finishExecutionWorkItem(root, queued.workItemId, { status: "completed", runId: "run-other" })).rejects.toThrow("EXECUTION_WORK_ITEM_RUN_FENCE");
    await expect(finishExecutionWorkItem(root, queued.workItemId, { status: "completed", runId: "run-heartbeat" })).resolves.toMatchObject({ status: "completed" });
  });

  it("persists a fencing token and rejects a late worker with the same run identity", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-fencing-token");
    const running = await claimExecutionWorkItem(root, queued.workItemId, "run-token");
    expect(running).toMatchObject({ fencingToken: 1, leaseId: expect.stringContaining("lease-") });
    await expect(finishExecutionWorkItem(root, queued.workItemId, { status: "completed", runId: "run-token", fencingToken: 99 })).rejects.toThrow("FENCING_TOKEN_LOST");
    await expect(heartbeatExecutionWorkItem(root, queued.workItemId, "run-token", 99)).rejects.toThrow("FENCING_TOKEN_LOST");
    await expect(finishExecutionWorkItem(root, queued.workItemId, { status: "completed", runId: "run-token", fencingToken: 1 })).resolves.toMatchObject({ status: "completed" });
  });

  it("fails closed on a stale running heartbeat instead of replaying the work", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-stale-heartbeat");
    await claimExecutionWorkItem(root, queued.workItemId, "run-stale");
    const itemPath = path.join(root, "sessions", "execution-work-items", `${queued.workItemId}.json`);
    const stale = JSON.parse(await fs.readFile(itemPath, "utf8"));
    stale.heartbeatAt = new Date(Date.now() - 120_000).toISOString();
    const { fingerprint: _old, ...withoutFingerprint } = stale;
    stale.fingerprint = crypto.createHash("sha256").update(JSON.stringify(withoutFingerprint)).digest("hex");
    await fs.writeFile(itemPath, JSON.stringify(stale), "utf8");

    const recovered = await recoverStaleExecutionWorkItems(root, 30_000);
    expect(recovered).toEqual([expect.objectContaining({ workItemId: queued.workItemId, status: "failed", error: "EXECUTION_WORK_ITEM_HEARTBEAT_STALE" })]);
    await expect(claimExecutionWorkItem(root, queued.workItemId, "run-replay")).resolves.toMatchObject({ status: "failed" });
  });

  it("fences concurrent cross-worker claims so only one owner enters running", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-fence");
    const [first, second] = await Promise.all([
      claimExecutionWorkItem(root, queued.workItemId, "run-a"),
      claimExecutionWorkItem(root, queued.workItemId, "run-b")
    ]);
    expect(first.status).toBe("running");
    expect(second.status).toBe("running");
    expect(second.runId).toBe(first.runId);
    expect(["run-a", "run-b"]).toContain(first.runId);
  });

  it("reclaims a stale claim lock left by a crashed worker", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-stale-lock");
    const lockPath = path.join(root, "sessions", "execution-work-items", `${queued.workItemId}.lock`);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, "crashed", "utf8");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, old, old);
    await expect(claimExecutionWorkItem(root, queued.workItemId, "run-recovered")).resolves.toMatchObject({ status: "running", runId: "run-recovered" });
  });

  it("proves the claim fence across independent worker processes", async () => {
    const root = await fixture(true);
    const queued = await enqueueExecutionWorkItem(root, "demo", "chapter-001", "idem-process-fence");
    const script = `import { claimExecutionWorkItem } from './src/executionQueue.ts'; claimExecutionWorkItem(process.argv[1], process.argv[2], process.argv[3]).then((item) => process.stdout.write(JSON.stringify({ status: item.status, runId: item.runId }))).catch((error) => { process.stderr.write(String(error)); process.exit(1); });`;
    const run = (runId: string) => execFileAsync(process.execPath, ["--import", "tsx/esm", "-e", script, root, queued.workItemId, runId], { cwd: path.resolve(process.cwd()) });
    const [first, second] = await Promise.all([run("process-a"), run("process-b")]);
    const firstResult = JSON.parse(first.stdout) as { status: string; runId?: string };
    const secondResult = JSON.parse(second.stdout) as { status: string; runId?: string };
    expect(firstResult.status).toBe("running");
    expect(secondResult.status).toBe("running");
    expect(secondResult.runId).toBe(firstResult.runId);
  });
});
