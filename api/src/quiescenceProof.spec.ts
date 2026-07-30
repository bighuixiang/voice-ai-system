import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueQuiescenceProof, readQuiescenceProof } from "./quiescenceProof.js";

async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "quiescence-proof-")); }

describe("quiescence proof", () => {
  it("issues a replayable proof only when no active work or mutation lease exists", async () => {
    const root = await fixture();
    const proof = await issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 });
    expect(proof).toMatchObject({ schemaVersion: "quiescence-proof.v1", status: "quiescent", bookRunId: "book-run-1", runVersion: 2, activeWorkItemIds: [], activeMutationLeases: [] });
    expect(await readQuiescenceProof(root, "book-run-1")).toMatchObject({ fingerprint: proof.fingerprint });
  });

  it("fails closed while an execution work item is still queued", async () => {
    const root = await fixture();
    const itemBase = { schemaVersion: "execution-work-item.v1", workItemId: "work-1", projectSlug: "demo", chapterId: "c1", versionId: "v1", proofFingerprint: "p", contextManifestId: "m", contextFingerprint: "c", status: "queued", idempotencyKey: "i", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/execution-work-items/work-1.json"), JSON.stringify({ ...itemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(itemBase)).digest("hex") }));
    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });
});
