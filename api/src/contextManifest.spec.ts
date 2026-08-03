import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest, readContextManifest } from "./contextManifest.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("context manifest persistence", () => {
  it("fails closed when a signed frozen manifest is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "context-manifest-"));
    roots.push(root);
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m-1", text: "Keep the bell unexplained." });
    const frozen = await freezeContextManifest(root, "demo");
    expect(frozen.manifest.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const target = path.join(root, "sessions", "context-manifest.json");
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    await fs.writeFile(target, JSON.stringify({ ...persisted, sourceMessages: [] }), "utf8");
    await expect(readContextManifest(root)).rejects.toThrow("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  });
});
