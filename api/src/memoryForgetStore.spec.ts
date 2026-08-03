import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { propagateMemoryForget, type ForgetPropagationResult } from "./memoryForgetPropagation.js";
import { persistMemoryForget, readMemoryForget } from "./memoryForgetStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("durable memory forget propagation", () => {
  it("persists a content-free tombstone and replays it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-forget-store-")); roots.push(root);
    const propagation = propagateMemoryForget({ memory: { memoryId: "m-store-1", scope: "project", scopeId: "demo", content: "private preference", status: "effective" }, reason: "author requested deletion", indexContains: true, cacheContains: true, publishedVersionRefs: ["publication://v1"] });
    const tombstone = await persistMemoryForget(root, "demo", propagation, ["publication://v1"]);
    expect(tombstone).toMatchObject({ schemaVersion: "memory-forget-tombstone.v1", memoryId: "m-store-1", contentIncluded: false, status: "forgotten" });
    expect(JSON.stringify(tombstone)).not.toContain("private preference");
    expect(await readMemoryForget(root, tombstone.tombstoneId)).toEqual(tombstone);
  });

  it("fails closed when the tombstone is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-forget-store-")); roots.push(root);
    const propagation = propagateMemoryForget({ memory: { memoryId: "m-store-2", scope: "scene", scopeId: "s1", content: "x", status: "effective" }, reason: "forget", indexContains: false, cacheContains: false, publishedVersionRefs: [] });
    const tombstone = await persistMemoryForget(root, "demo", propagation, []);
    const target = path.join(root, "memory", "forget-tombstones", `${tombstone.tombstoneId}.json`);
    const tampered = { ...tombstone, reason: "forged" };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readMemoryForget(root, tombstone.tombstoneId)).rejects.toThrow("MEMORY_FORGET_TOMBSTONE_INTEGRITY_FAILED");
  });
});
