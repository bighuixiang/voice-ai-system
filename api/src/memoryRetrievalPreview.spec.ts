import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeSearchResult } from "./types.js";
import { assertMemoryRetrievalPreviewIntegrity, buildMemoryRetrievalPreview, persistMemoryRetrievalPreview, readMemoryRetrievalPreview } from "./memoryRetrievalPreview.js";

let root = "";

const result = (): KnowledgeSearchResult => ({
  query: "gate blood",
  tokens: ["gate", "blood"],
  vectorSummary: { provider: "local", dimensions: 64, entryCount: 2, updatedAt: "2026-08-03T00:00:00.000Z" },
  retrievalAudit: {
    schemaVersion: "knowledge-retrieval-audit.v1",
    boundary: { query: "gate blood", audience: "author", authorized: true },
    eligibleFactIds: ["fact:a", "fact:b"],
    excluded: [{ id: "fact:c", reason: "MEMORY_CLAIM_STATUS_OBSOLETE" }],
    selectedIds: ["fact:a", "fact:b"],
    evidenceSourceIds: ["chapter-1", "chapter-2"],
    evidenceSourceCount: 2,
    vectorSummary: { provider: "local", dimensions: 64, entryCount: 2, updatedAt: "2026-08-03T00:00:00.000Z" },
    resultFingerprint: "source-fingerprint"
  },
  facts: [],
  triples: [],
  chapters: [],
  excluded: [{ id: "fact:c", reason: "MEMORY_CLAIM_STATUS_OBSOLETE" }]
});

describe("memoryRetrievalPreview", () => {
  afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });

  it("builds a bounded, replayable preview from eligibility audit", async () => {
    const preview = buildMemoryRetrievalPreview({ projectSlug: "demo", result: result(), maxResults: 1 });
    expect(preview).toMatchObject({
      schemaVersion: "memory-retrieval-preview.v1",
      retrievalId: expect.stringMatching(/^retrieval-[a-f0-9]{24}$/),
      selectedIds: ["fact:a"],
      truncatedIds: ["fact:b"],
      excluded: [{ id: "fact:c", reason: "MEMORY_CLAIM_STATUS_OBSOLETE" }],
      evidenceSourceCount: 2
    });
    expect(assertMemoryRetrievalPreviewIntegrity(preview)).toEqual(preview);
  });

  it("persists and rejects tampered previews", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "retrieval-preview-"));
    const preview = buildMemoryRetrievalPreview({ projectSlug: "demo", result: result(), maxResults: 2 });
    await persistMemoryRetrievalPreview(root, preview);
    expect(await readMemoryRetrievalPreview(root, preview.retrievalId)).toEqual(preview);
    await fs.writeFile(path.join(root, "memory", "retrievals", `${preview.retrievalId}.json`), JSON.stringify({ ...preview, selectedIds: ["fact:tampered"] }), "utf8");
    await expect(readMemoryRetrievalPreview(root, preview.retrievalId)).rejects.toThrow("RETRIEVAL_PREVIEW_INTEGRITY_FAILED");
    expect(() => assertMemoryRetrievalPreviewIntegrity({ ...preview, selectedIds: ["fact:tampered"] })).toThrow("RETRIEVAL_PREVIEW_INTEGRITY_FAILED");
  });

  it("requires an audit and a positive budget", () => {
    expect(() => buildMemoryRetrievalPreview({ projectSlug: "demo", result: { ...result(), retrievalAudit: undefined }, maxResults: 1 })).toThrow("RETRIEVAL_AUDIT_REQUIRED");
    expect(() => buildMemoryRetrievalPreview({ projectSlug: "demo", result: result(), maxResults: 0 })).toThrow("RETRIEVAL_BUDGET_REQUIRED");
  });
});
