import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";
import { createProseCandidate } from "./proseCandidate.js";
import { adoptProseCandidate } from "./proseAdoption.js";
import { settleChapter } from "./chapterSettlement.js";
import { publishDerivedAssets, readDerivedPublicationTransaction } from "./derivedPublication.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "derived-publication-"));
  await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "m1", text: "A locked promise." }); await freezeContextManifest(root, "demo");
  await fs.mkdir(path.join(root, "chapters"), { recursive: true }); await fs.writeFile(path.join(root, "chapters", "c1.md"), "old\n", "utf8");
  const candidate = await createProseCandidate({ root, projectSlug: "demo", chapterId: "c1", content: "new", outlineVersionId: "outline-v1", executionProofFingerprint: "proof-1", sourceFingerprint: "source-1" });
  const adoption = await adoptProseCandidate({ root, candidateId: candidate.candidateId, targetPath: "chapters/c1.md", expectedCanonSha256: crypto.createHash("sha256").update("old\n").digest("hex"), authorizationId: "author-1" });
  const settlement = await settleChapter({ root, projectSlug: "demo", chapterId: "c1", adoptionTransactionId: adoption.transactionId, targetPath: "chapters/c1.md" });
  return { root, settlement };
}

describe("derived publication transaction", () => {
  it("commits multiple derived assets atomically and is idempotent", async () => {
    const { root, settlement } = await fixture(); const writes = [{ relativePath: "memory/summary.json", content: "{\"summary\":\"ok\"}\n" }, { relativePath: "quality/c1.json", content: "{\"score\":90}\n" }];
    const first = await publishDerivedAssets({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes });
    expect(first.status).toBe("committed"); expect(await publishDerivedAssets({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes })).toEqual(first);
    await expect(fs.readFile(path.join(root, "memory", "summary.json"), "utf8")).resolves.toBe(writes[0].content);
  });

  it("rolls every derived asset back when a later write fails", async () => {
    const { root, settlement } = await fixture(); const writes = [{ relativePath: "memory/summary.json", content: "new-summary\n" }, { relativePath: "quality/c1.json", content: "new-quality\n" }];
    await expect(publishDerivedAssets({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes, faultAfterWrites: 1 })).rejects.toThrow("FAULT_DERIVED_PUBLICATION");
    await expect(fs.stat(path.join(root, "memory", "summary.json"))).rejects.toMatchObject({ code: "ENOENT" });
    const names = await fs.readdir(path.join(root, "sessions", "derived-publications")); const transaction = await readDerivedPublicationTransaction(root, names.find((name) => name.endsWith(".json"))!.replace(/\.json$/, ""));
    expect(transaction?.status).toBe("rolled_back");
  });

  it("fails closed when an existing derived transaction is tampered", async () => {
    const { root, settlement } = await fixture();
    const writes = [{ relativePath: "memory/summary.json", content: "stable\n" }];
    const first = await publishDerivedAssets({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes });
    const target = path.join(root, "sessions", "derived-publications", `${first.transactionId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.projectSlug = "tampered";
    await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    await expect(publishDerivedAssets({ root, projectSlug: "demo", chapterId: "c1", settlementId: settlement.settlementId, writes })).rejects.toThrow("DERIVED_PUBLICATION_INTEGRITY_FAILED");
  });
});
