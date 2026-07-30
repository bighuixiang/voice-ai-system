import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { adoptProseCandidate } from "./proseAdoption.js";
import { createProseCandidate } from "./proseCandidate.js";
import { readChapterSettlement, settleChapter } from "./chapterSettlement.js";
import { createBookWorkGraph, readBookWorkGraph } from "./bookWorkGraph.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-settlement-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." });
  await freezeContextManifest(root, "demo");
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.writeFile(path.join(root, "chapters", "c1.md"), "old canon\n", "utf8");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new candidate", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const expected = crypto.createHash("sha256").update("old canon\n").digest("hex");
  const transaction = await adoptProseCandidate({ root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: expected, authorizationId: "author-1" });
  return { root, transaction };
}

describe("chapter settlement", () => {
  it("settles only the committed adopted content and is idempotent", async () => {
    const { root, transaction } = await fixture();
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    const input = { root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" };
    const settlement = await settleChapter(input);
    expect(settlement.status).toBe("settled");
    expect(settlement.nextAction).toBe("schedule_dependency_ready_work");
    expect((await settleChapter(input)).fingerprint).toBe(settlement.fingerprint);
    expect(await readChapterSettlement(root, settlement.settlementId)).toEqual(settlement);
    expect((await readBookWorkGraph(root))?.workItems.map((item) => item.status)).toEqual(["completed", "ready"]);
  });

  it("blocks settlement when adopted content is changed after commit", async () => {
    const { root, transaction } = await fixture();
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "tampered\n", "utf8");
    await expect(settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: transaction.transactionId, targetPath: "chapters/c1.md" })).rejects.toThrow("CHAPTER_SETTLEMENT_CONTENT_STALE");
  });
});
