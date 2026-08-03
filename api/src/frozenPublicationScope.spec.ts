import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFrozenPublicationScope, readFrozenPublicationScope } from "./frozenPublicationScope.js";

describe("frozen publication scope", () => {
  it("persists a deterministic, immutable chapter scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frozen-scope-"));
    const input = { root, projectSlug: "demo", chapterIds: ["c2", "c1", "c1"], scopeFingerprint: "a".repeat(64) };
    const first = await createFrozenPublicationScope(input);
    expect(await createFrozenPublicationScope(input)).toEqual(first);
    expect(first).toMatchObject({ status: "frozen", chapterIds: ["c1", "c2"] });
    expect(await readFrozenPublicationScope(root, first.scopeId)).toEqual(first);
  });

  it("records accepted evidence bindings and explicit unbound markers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frozen-scope-evidence-"));
    const fingerprint = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const evidence = {
      storyContract: { status: "bound" as const, ref: "sessions/story-contract-adoption-proposal.json", fingerprint: "c".repeat(64) },
      outlineVersion: { status: "unbound" as const, ref: "outline-version:unbound", reason: "ARTIFACT_NOT_FOUND" as const },
      obligationCoverage: { status: "bound" as const, ref: "sessions/obligations/coverage-certificate.json", fingerprint: "d".repeat(64) }
    };
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "e".repeat(64), evidence });
    expect(scope.evidence).toEqual(evidence);
    expect(fingerprint(Object.fromEntries(Object.entries(scope).filter(([key]) => key !== "fingerprint")))).toBe(scope.fingerprint);
    expect(await readFrozenPublicationScope(root, scope.scopeId)).toEqual(scope);
  });

  it("rejects a tampered frozen scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frozen-scope-tamper-"));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "b".repeat(64) });
    const target = path.join(root, "sessions/publication-scopes", `${scope.scopeId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.chapterIds = ["c9"];
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readFrozenPublicationScope(root, scope.scopeId)).rejects.toThrow("FROZEN_PUBLICATION_SCOPE_INTEGRITY_FAILED");
  });
});
