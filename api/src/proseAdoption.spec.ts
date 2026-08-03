import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { adoptProseCandidate, readProseAdoptionTransaction } from "./proseAdoption.js";
import { createProseCandidate } from "./proseCandidate.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-adoption-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.writeFile(path.join(root, "chapters", "c1.md"), "old canon\n", "utf8");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new candidate", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  return { root, candidate };
}

describe("prose adoption transaction", () => {
  it("atomically adopts a validated candidate and is idempotent", async () => {
    const { root, candidate } = await fixture();
    const expected = "old canon\n";
    const input = { root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: crypto.createHash("sha256").update(expected).digest("hex"), authorizationId: "author-1" };
    const committed = await adoptProseCandidate(input);
    expect(committed.status).toBe("committed");
    expect(committed.reviewVerdict).toBe("supports-adoption");
    expect(committed.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.audit).toMatchObject({
      maturity: "author_accepted",
      authority: "author",
      revisionMode: "direct",
      lockCheckPassed: true,
      validationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      rollbackVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
      derivedCandidates: []
    });
    expect(committed.audit.changeSet).toEqual([expect.objectContaining({
      segmentId: "c1",
      startOffset: 0,
      endOffset: "new candidate".length,
      beforeFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      afterFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    })]);
    await expect(fs.readFile(path.join(root, "chapters", "c1.md"), "utf8")).resolves.toBe("new candidate");
    expect((await adoptProseCandidate(input)).transactionId).toBe(committed.transactionId);
  });
  it("does not hide target canon drift on a committed adoption replay", async () => {
    const { root, candidate } = await fixture();
    const expected = crypto.createHash("sha256").update("old canon\n").digest("hex");
    const input = { root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: expected, authorizationId: "author-1" };
    await adoptProseCandidate(input);
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "drifted canon\n", "utf8");
    await expect(adoptProseCandidate(input)).rejects.toThrow("PROSE_ADOPTION_TARGET_STALE");
  });

  it("rolls the canon back when commit fails after the target write", async () => {
    const { root, candidate } = await fixture();
    const expected = "old canon\n";
    const input = { root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: crypto.createHash("sha256").update(expected).digest("hex"), authorizationId: "author-1", faultAt: "after-target-write" as const };
    await expect(adoptProseCandidate(input)).rejects.toThrow("FAULT_AFTER_TARGET_WRITE");
    await expect(fs.readFile(path.join(root, "chapters", "c1.md"), "utf8")).resolves.toBe(expected);
    const files = await fs.readdir(path.join(root, "sessions", "prose-adoptions"));
    const transaction = await readProseAdoptionTransaction(root, files[0].replace(/\.json$/, ""));
    expect(transaction?.status).toBe("rolled_back");
  });

  it("fails closed when a persisted adoption transaction is tampered before reuse", async () => {
    const { root, candidate } = await fixture();
    const expected = "old canon\n";
    const input = { root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: crypto.createHash("sha256").update(expected).digest("hex"), authorizationId: "author-1" };
    const committed = await adoptProseCandidate(input);
    const target = path.join(root, "sessions", "prose-adoptions", `${committed.transactionId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.authorizationId = "tampered-author";
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readProseAdoptionTransaction(root, committed.transactionId)).rejects.toThrow("PROSE_ADOPTION_INTEGRITY_FAILED");
    await expect(adoptProseCandidate(input)).rejects.toThrow("PROSE_ADOPTION_INTEGRITY_FAILED");
  });
});
