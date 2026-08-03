import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFrozenPublicationScope } from "./frozenPublicationScope.js";
import { fingerprintContextManifest } from "./contextManifest.js";
import { createBookRunAuthorityBinding, verifyModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";

const roots: string[] = [];
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("model invocation authority", () => {
  it("builds a binding from the frozen BookRun sources and verifies it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "model-authority-"));
    roots.push(root);
    const storyBase = { schemaVersion: "story-contract.v1", status: "committed", canonWritten: true };
    const outlineBase = { schemaVersion: "outline-version.v1", status: "active", canonWritten: true, selectedChapterIds: ["c1"] };
    const story = { ...storyBase, fingerprint: hash(storyBase) };
    const outline = { ...outlineBase, fingerprint: hash(outlineBase) };
    const forecast = { schemaVersion: "length-forecast.v1", projectSlug: "demo", fingerprint: "d".repeat(64) };
    const manifest = {
      schemaVersion: "context-manifest.v1" as const,
      manifestId: "context-1",
      projectSlug: "demo",
      purpose: "understanding" as const,
      sourceSessionId: "session-1",
      sourceFingerprint: "source-1",
      sourceMessages: [],
      blocks: [],
      frozenAt: new Date().toISOString()
    };
    await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "publication-scopes"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "book-runs"), { recursive: true });
    await fs.mkdir(path.join(root, "planning"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "story-contract.json"), JSON.stringify(story));
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-1.json"), JSON.stringify(outline));
    await fs.writeFile(path.join(root, "planning", "length-forecast.json"), JSON.stringify(forecast));
    await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify(manifest));
    const scope = await createFrozenPublicationScope({
      root,
      projectSlug: "demo",
      chapterIds: ["c1"],
      scopeFingerprint: "a".repeat(64),
      evidence: {
        storyContract: { status: "bound", ref: "sessions/story-contract.json", fingerprint: story.fingerprint },
        outlineVersion: { status: "bound", ref: "sessions/outline-versions/outline-1.json", fingerprint: outline.fingerprint }
      }
    });
    const run = { bookRunId: "book-run-1", frozenPublicationScopeRef: `sessions/publication-scopes/${scope.scopeId}.json` };
    const binding = await createBookRunAuthorityBinding(root, run);
    expect(binding.contextManifestFingerprint).toBe(fingerprintContextManifest(manifest));
    expect(binding.outlineRef).toBe("sessions/outline-versions/outline-1.json");
    await fs.writeFile(path.join(root, "sessions", "book-runs", "book-run-1.json"), "{}");
    await expect(verifyModelInvocationAuthorityBinding(root, binding)).resolves.toBeUndefined();
  });

  it("refuses to build a binding when frozen scope evidence is unbound", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "model-authority-missing-"));
    roots.push(root);
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "a".repeat(64) });
    await expect(createBookRunAuthorityBinding(root, { bookRunId: "book-run-1", frozenPublicationScopeRef: `sessions/publication-scopes/${scope.scopeId}.json` })).rejects.toThrow("MODEL_INVOCATION_AUTHORITY_BINDING_UNAVAILABLE");
  });
});
