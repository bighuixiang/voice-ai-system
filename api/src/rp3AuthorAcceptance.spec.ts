import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistRp3AuthorAcceptance, readRp3AuthorAcceptance } from "./rp3AuthorAcceptance.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("RP3 author acceptance persistence", () => {
  it("persists an explicit acceptance and replays it idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rp3-author-acceptance-")); roots.push(root);
    const input = { status: "accepted" as const, actorId: "author-1", authorizationId: "rp3-final-1", evidenceRefs: ["decision://rp3/final"] };
    const first = await persistRp3AuthorAcceptance(root, input);
    const second = await persistRp3AuthorAcceptance(root, input);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ schemaVersion: "rp3-author-acceptance.v1", ...input });
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(readRp3AuthorAcceptance(root)).resolves.toEqual(first);
  });

  it("rejects mutation after a different acceptance has been recorded", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rp3-author-acceptance-immutable-")); roots.push(root);
    await persistRp3AuthorAcceptance(root, { status: "accepted", actorId: "author-1", authorizationId: "a-1", evidenceRefs: ["decision://rp3/1"] });
    await expect(persistRp3AuthorAcceptance(root, { status: "rejected", actorId: "author-1", authorizationId: "a-2", evidenceRefs: ["decision://rp3/2"] })).rejects.toThrow("RP3_AUTHOR_ACCEPTANCE_ALREADY_RECORDED");
  });

  it("detects tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rp3-author-acceptance-tamper-")); roots.push(root);
    const record = await persistRp3AuthorAcceptance(root, { status: "accepted", actorId: "author-1", authorizationId: "a-1", evidenceRefs: ["decision://rp3/1"] });
    const target = path.join(root, "rp3-author-acceptance.json");
    const tampered = { ...record, actorId: "attacker", fingerprint: crypto.createHash("sha256").update("wrong").digest("hex") };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readRp3AuthorAcceptance(root)).rejects.toThrow("RP3_AUTHOR_ACCEPTANCE_CORRUPT");
  });
});
