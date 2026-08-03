import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { monitorContractProjectionFreshness, rebuildContractProjections, readContractProjectionFreshness, readProjectionFreshnessEvents, readProjectionRebuildReceipt, startProjectionFreshnessMonitor } from "./contractProjectionRebuild.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("contract projection rebuild", () => {
  it("rebuilds story graph and knowledge projections from invalidation events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), JSON.stringify({ schemaVersion: "projection-invalidation-event.v1", mutationId: "mutation-1", candidateId: "candidate-1", reviewId: "review-1", affectedProjections: ["story-graph", "knowledge-index"], createdAt: new Date().toISOString() }) + "\n", "utf8");
    const project = { id: "demo", slug: "demo", title: "Demo", genre: "fantasy", roughIdea: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastOpenedChapterId: "chapter-001", codex: { command: "mock" }, chapters: [] };
    const receipt = await rebuildContractProjections(root, project);
    expect(receipt).toMatchObject({ schemaVersion: "projection-rebuild-receipt.v1", mutationIds: ["mutation-1"] });
    expect(receipt?.projections).toEqual(expect.arrayContaining([expect.objectContaining({ name: "story-graph", status: "rebuilt" }), expect.objectContaining({ name: "knowledge-index", status: "rebuilt" })]));
    expect(await fs.stat(path.join(root, "story-graph", "storyline.json"))).toBeTruthy();
    expect(await fs.stat(path.join(root, "knowledge", "facts.jsonl"))).toBeTruthy();
    expect(await readProjectionRebuildReceipt(root)).toEqual(receipt);
    expect(await readContractProjectionFreshness(root, "demo")).toMatchObject({ status: "current", pendingMutationIds: [] });
    await fs.appendFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), JSON.stringify({ schemaVersion: "projection-invalidation-event.v1", mutationId: "mutation-2", candidateId: "candidate-2", reviewId: "review-2", affectedProjections: ["story-graph"], createdAt: new Date().toISOString() }) + "\n", "utf8");
    expect(await readContractProjectionFreshness(root, "demo")).toMatchObject({ status: "stale", pendingMutationIds: ["mutation-2"] });
  });

  it("records freshness checks as auditable monitor events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-monitor-"));
    roots.push(root);
    const event = await monitorContractProjectionFreshness(root, "demo");
    expect(event).toMatchObject({ schemaVersion: "projection-freshness-monitor-event.v1", projectSlug: "demo", freshness: { status: "unknown" } });
    expect(await readProjectionFreshnessEvents(root)).toEqual([event]);
  });

  it("fails closed when the persisted rebuild receipt is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-tampered-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "projection-rebuild-receipt.json"), JSON.stringify({
      schemaVersion: "projection-rebuild-receipt.v1", receiptId: "receipt-1", projectSlug: "demo", mutationIds: [], projections: [], createdAt: new Date().toISOString(), fingerprint: "f".repeat(64)
    }), "utf8");

    await expect(readProjectionRebuildReceipt(root)).rejects.toThrow("PROJECTION_REBUILD_RECEIPT_INTEGRITY_FAILED");
  });

  it("rejects a validly hashed receipt that references unknown mutations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-unknown-mutation-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = { schemaVersion: "projection-rebuild-receipt.v1", receiptId: "receipt-unknown", projectSlug: "demo", mutationIds: ["missing-mutation"], projections: [], createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "projection-rebuild-receipt.json"), JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }), "utf8");

    await expect(readContractProjectionFreshness(root, "demo")).rejects.toThrow("PROJECTION_REBUILD_RECEIPT_SEMANTIC_MISMATCH");
  });

  it("rejects a receipt with malformed collection fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-malformed-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const base = { schemaVersion: "projection-rebuild-receipt.v1", receiptId: "receipt-malformed", projectSlug: "demo", mutationIds: "not-an-array", projections: [], createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "projection-rebuild-receipt.json"), JSON.stringify({ ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }), "utf8");

    await expect(readProjectionRebuildReceipt(root)).rejects.toThrow("PROJECTION_REBUILD_RECEIPT_SEMANTIC_MISMATCH");
  });

  it("continuously checks freshness and emits a stale alert without writing canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-projection-monitor-")); roots.push(root);
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), JSON.stringify({ schemaVersion: "projection-invalidation-event.v1", mutationId: "pending-1", candidateId: "candidate-1", reviewId: "review-1", affectedProjections: ["story-graph"], createdAt: new Date().toISOString() }) + "\n", "utf8");
    const alerts: unknown[] = [];
    const stop = startProjectionFreshnessMonitor(root, "demo", { intervalMs: 10, onStale: (event) => alerts.push(event) });
    const deadline = Date.now() + 1000;
    while (alerts.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    stop();
    expect(alerts.length).toBeGreaterThan(0);
    expect((alerts[0] as { freshness: { status: string } }).freshness.status).toBe("stale");
    expect((await readProjectionFreshnessEvents(root)).length).toBeGreaterThanOrEqual(alerts.length);
  });
});
