import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { KnowledgeSearchResult } from "./types.js";
import { resolveInside } from "./pathSafety.js";

export interface MemoryRetrievalPreview {
  schemaVersion: "memory-retrieval-preview.v1";
  retrievalId: string;
  projectSlug: string;
  query: string;
  boundary: NonNullable<KnowledgeSearchResult["retrievalAudit"]>["boundary"];
  eligibleFactIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  selectedIds: string[];
  truncatedIds: string[];
  evidenceSourceIds: string[];
  evidenceSourceCount: number;
  evidenceProfile?: NonNullable<KnowledgeSearchResult["retrievalAudit"]>["evidenceProfile"];
  budget: { maxResults: number };
  vectorSummary?: KnowledgeSearchResult["vectorSummary"];
  sourceResultFingerprint: string;
  resultFingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function previewPath(root: string, retrievalId: string): string {
  if (!/^retrieval-[a-f0-9]{24}$/i.test(retrievalId)) throw new Error("RETRIEVAL_ID_INVALID");
  return resolveInside(root, path.join("memory", "retrievals", `${retrievalId}.json`));
}

export function buildMemoryRetrievalPreview(input: {
  projectSlug: string;
  result: KnowledgeSearchResult;
  maxResults: number;
}): MemoryRetrievalPreview {
  if (!input.projectSlug.trim() || !input.result.query.trim()) throw new Error("RETRIEVAL_QUERY_REQUIRED");
  if (!Number.isInteger(input.maxResults) || input.maxResults < 1) throw new Error("RETRIEVAL_BUDGET_REQUIRED");
  const audit = input.result.retrievalAudit;
  if (!audit) throw new Error("RETRIEVAL_AUDIT_REQUIRED");
  const selectedIds = audit.selectedIds.slice(0, input.maxResults);
  const truncatedIds = audit.selectedIds.slice(input.maxResults);
  const base = {
    schemaVersion: "memory-retrieval-preview.v1" as const,
    projectSlug: input.projectSlug,
    query: input.result.query,
    boundary: audit.boundary,
    eligibleFactIds: [...audit.eligibleFactIds],
    excluded: [...audit.excluded],
    selectedIds,
    truncatedIds,
    evidenceSourceIds: [...audit.evidenceSourceIds],
    evidenceSourceCount: audit.evidenceSourceCount,
    evidenceProfile: audit.evidenceProfile,
    budget: { maxResults: input.maxResults },
    vectorSummary: input.result.vectorSummary,
    sourceResultFingerprint: audit.resultFingerprint
  };
  const retrievalId = `retrieval-${hash(base).slice(0, 24)}`;
  const withId = { ...base, retrievalId };
  return { ...withId, resultFingerprint: hash(withId) };
}

export function assertMemoryRetrievalPreviewIntegrity(preview: MemoryRetrievalPreview): MemoryRetrievalPreview {
  const { resultFingerprint, ...base } = preview;
  if (preview.schemaVersion !== "memory-retrieval-preview.v1" || !/^retrieval-[a-f0-9]{24}$/i.test(preview.retrievalId) || hash(base) !== resultFingerprint) {
    throw new Error("RETRIEVAL_PREVIEW_INTEGRITY_FAILED");
  }
  return preview;
}

export async function persistMemoryRetrievalPreview(root: string, preview: MemoryRetrievalPreview): Promise<MemoryRetrievalPreview> {
  assertMemoryRetrievalPreviewIntegrity(preview);
  const target = previewPath(root, preview.retrievalId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
  return preview;
}

export async function readMemoryRetrievalPreview(root: string, retrievalId: string): Promise<MemoryRetrievalPreview | null> {
  try {
    const raw = await fs.readFile(previewPath(root, retrievalId), "utf8");
    return assertMemoryRetrievalPreviewIntegrity(JSON.parse(raw) as MemoryRetrievalPreview);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
