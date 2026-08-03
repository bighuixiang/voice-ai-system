import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertBookRunImpactSubgraphIntegrity, readBookRunImpactSubgraph, recordBookRunImpactSubgraph } from "./bookRunImpact.js";

describe("book run impact subgraph", () => {
  it("persists the scoped work-item and chapter impact deterministically", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-impact-"));
    const input = { root, invalidationId: "invalidation-1", bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 4, reason: "completion-evidence-stale" as const, sourceFingerprint: "canon-1", workItems: [{ workItemId: "w2", chapterId: "c2" }, { workItemId: "w1", chapterId: "c1" }, { workItemId: "w1", chapterId: "c1" }] };
    const first = await recordBookRunImpactSubgraph(input);
    const second = await recordBookRunImpactSubgraph(input);
    expect(second).toEqual(first);
    expect(first.affectedWorkItemIds).toEqual(["w1", "w2"]);
    expect(first.affectedChapterIds).toEqual(["c1", "c2"]);
    expect(await readBookRunImpactSubgraph(root, first.impactId)).toEqual(first);
  });

  it("rejects a tampered impact receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-impact-tamper-"));
    const impact = await recordBookRunImpactSubgraph({ root, invalidationId: "invalidation-1", bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 1, reason: "completion-evidence-stale", sourceFingerprint: "canon-1", workItems: [{ workItemId: "w1", chapterId: "c1" }] });
    const target = path.join(root, "sessions/book-run-impact", `${impact.impactId}.json`);
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    tampered.affectedChapterIds = ["c9"];
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readBookRunImpactSubgraph(root, impact.impactId)).rejects.toThrow("BOOK_RUN_IMPACT_INTEGRITY_FAILED");
  });
  it("rejects a re-signed receipt with an invalid reason or empty impact", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-run-impact-semantic-")); const impact = await recordBookRunImpactSubgraph({ root, invalidationId: "invalidation-1", bookRunId: "book-run-1", projectSlug: "demo", priorRunVersion: 1, reason: "completion-evidence-stale", sourceFingerprint: "canon-1", workItems: [{ workItemId: "w1", chapterId: "c1" }] }); const { fingerprint: _fingerprint, ...base } = impact; const invalidBase = { ...base, reason: "other", affectedWorkItemIds: [] }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertBookRunImpactSubgraphIntegrity(invalid as typeof impact)).toThrow("BOOK_RUN_IMPACT_INTEGRITY_FAILED"); });
});
