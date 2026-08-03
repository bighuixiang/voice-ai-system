import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface BookRunImpactSubgraph {
  schemaVersion: "book-run-impact-subgraph.v1";
  impactId: string;
  invalidationId: string;
  bookRunId: string;
  projectSlug: string;
  priorRunVersion: number;
  reason: "completion-evidence-stale";
  affectedWorkItemIds: string[];
  affectedChapterIds: string[];
  sourceFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function impactPath(root: string, id: string): string { return resolveInside(root, `sessions/book-run-impact/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function assertBookRunImpactSubgraphIntegrity(impact: BookRunImpactSubgraph, expectedId?: string): BookRunImpactSubgraph {
    const { fingerprint, ...base } = impact;
    const ids = (values: unknown) => Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string" && value.trim());
    const valid = impact.schemaVersion === "book-run-impact-subgraph.v1" && (!expectedId || impact.impactId === expectedId) && [impact.impactId, impact.invalidationId, impact.bookRunId, impact.projectSlug, impact.sourceFingerprint, impact.createdAt].every((value) => typeof value === "string" && value.trim()) && Number.isInteger(impact.priorRunVersion) && impact.priorRunVersion >= 1 && impact.reason === "completion-evidence-stale" && ids(impact.affectedWorkItemIds) && ids(impact.affectedChapterIds) && !Number.isNaN(Date.parse(impact.createdAt)) && /^[a-f0-9]{64}$/i.test(impact.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("BOOK_RUN_IMPACT_INTEGRITY_FAILED");
    return impact;
}

export async function readBookRunImpactSubgraph(root: string, impactId: string): Promise<BookRunImpactSubgraph | null> {
  try {
    const impact = JSON.parse(await fs.readFile(impactPath(root, impactId), "utf8")) as BookRunImpactSubgraph;
    return assertBookRunImpactSubgraphIntegrity(impact, impactId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function recordBookRunImpactSubgraph(input: {
  root: string;
  invalidationId: string;
  bookRunId: string;
  projectSlug: string;
  priorRunVersion: number;
  reason: "completion-evidence-stale";
  sourceFingerprint: string;
  workItems: Array<{ workItemId: string; chapterId: string }>;
}): Promise<BookRunImpactSubgraph> {
  const affectedWorkItems = [...new Map(input.workItems.filter((item) => item.workItemId.trim() && item.chapterId.trim()).map((item) => [item.workItemId, item])).values()].sort((a, b) => a.workItemId.localeCompare(b.workItemId));
  const identity = {
    invalidationId: input.invalidationId,
    bookRunId: input.bookRunId,
    projectSlug: input.projectSlug,
    priorRunVersion: input.priorRunVersion,
    reason: input.reason,
    affectedWorkItemIds: affectedWorkItems.map((item) => item.workItemId),
    affectedChapterIds: [...new Set(affectedWorkItems.map((item) => item.chapterId))].sort(),
    sourceFingerprint: input.sourceFingerprint.trim()
  };
  const impactId = `impact-${hash(identity).slice(0, 24)}`;
  const existing = await readBookRunImpactSubgraph(input.root, impactId);
  if (existing) return existing;
  const base = { schemaVersion: "book-run-impact-subgraph.v1" as const, impactId, ...identity, createdAt: new Date().toISOString() };
  const impact: BookRunImpactSubgraph = { ...base, fingerprint: hash(base) };
  await writeJson(impactPath(input.root, impactId), impact);
  return impact;
}
