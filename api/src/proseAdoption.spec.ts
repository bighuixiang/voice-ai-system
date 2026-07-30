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
    await expect(fs.readFile(path.join(root, "chapters", "c1.md"), "utf8")).resolves.toBe("new candidate");
    expect((await adoptProseCandidate(input)).transactionId).toBe(committed.transactionId);
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
});
