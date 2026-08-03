import fs from "node:fs/promises";
import { resolveInside } from "./pathSafety.js";
import { assertMemoryClaimEventIntegrity, type MemoryClaimEvent } from "./memoryClaim.js";

export interface MemoryProjectionFreshness {
  status: "current" | "replacement-pending" | "stale" | "unknown";
  blockingReasons: string[];
  affectedClaimIds: string[];
}

export function assertMemoryProjectionCanGenerate(freshness: MemoryProjectionFreshness): void {
  if (freshness.status === "current") return;
  throw new Error(freshness.blockingReasons[0] || "MEMORY_PROJECTION_NOT_CURRENT");
}

async function readEvents(root: string): Promise<MemoryClaimEvent[]> {
  try {
    const content = await fs.readFile(resolveInside(root, "memory/claims/events.jsonl"), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => assertMemoryClaimEventIntegrity(JSON.parse(line) as MemoryClaimEvent));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function evaluateMemoryProjectionFreshness(root: string): Promise<MemoryProjectionFreshness> {
  const events = await readEvents(root);
  const byClaim = new Map<string, MemoryClaimEvent[]>();
  for (const event of events) byClaim.set(event.claimId, [...(byClaim.get(event.claimId) || []), event]);
  const affectedClaimIds: string[] = [];
  let replacementPending = false;
  let stale = false;
  let missingSource = false;
  for (const [claimId, history] of byClaim) {
    const latest = history.at(-1);
    if (!latest) continue;
    if (latest.claim.status === "obsolete" || latest.eventType === "obsoleted") { stale = true; affectedClaimIds.push(claimId); continue; }
    if (history.some((event) => event.eventType === "obsoleted") && latest.claim.status !== "eligible") { replacementPending = true; affectedClaimIds.push(claimId); }
    const fileRefs = [...latest.claim.sourceRefs, ...latest.claim.evidenceAnchors]
      .filter((ref) => ref.startsWith("file://") || ref.startsWith("path://"))
      .map((ref) => ref.replace(/^(?:file|path):\/\//, "").split("#", 1)[0])
      .filter(Boolean);
    for (const ref of fileRefs) {
      try {
        await fs.access(resolveInside(root, ref));
      } catch {
        stale = true;
        missingSource = true;
        affectedClaimIds.push(claimId);
        break;
      }
    }
  }
  if (stale) return { status: "stale", blockingReasons: [missingSource ? "MEMORY_CLAIM_SOURCE_MISSING" : "MEMORY_PROJECTION_STALE"], affectedClaimIds: [...new Set(affectedClaimIds)].sort() };
  if (replacementPending) return { status: "replacement-pending", blockingReasons: ["MEMORY_REPLACEMENT_PENDING"], affectedClaimIds: [...new Set(affectedClaimIds)].sort() };
  return { status: "current", blockingReasons: [], affectedClaimIds: [] };
}
