import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchQueuedExecutionWorkItems } from "./executionDispatcher.js";
import { enqueueExecutionWorkItem, readExecutionWorkItem } from "./executionQueue.js";

const roots: string[] = [];
afterEach(async () => { delete process.env.NOVEL_DB_PATH; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-dispatch-")); roots.push(root);
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "execution-dispatch-db-"));
  process.env.NOVEL_DB_PATH = path.join(dataRoot, "runtime.sqlite");
  await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
  const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-v1", projectSlug: "demo", version: 1, outlineId: "outline-1", outlineFingerprint: "outline-fp", selectedChapterIds: ["c1"], strongFreezeCount: 3, status: "active", canonWritten: true, createdAt: new Date().toISOString() };
  const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
  const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-1", projectSlug: "demo", versionId: version.versionId, versionFingerprint: version.fingerprint, status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
  const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-versions", "v1.json"), JSON.stringify(version), "utf8");
  await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify(proof), "utf8");
  await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-1", sourceFingerprint: "context-fp" }), "utf8");
  return root;
}

describe("execution dispatcher", () => {
  it("claims a queued execution item and emits one runtime command bound to its run", async () => {
    const root = await fixture();
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "book-idem");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts).toEqual([expect.objectContaining({ workItemId: item.workItemId, status: "dispatched" })]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "running", runId: receipts[0].runId }));
  });
});
