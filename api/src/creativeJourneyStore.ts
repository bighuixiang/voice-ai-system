import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { CreativeJourneyProjection } from "./creativeJourney.js";

function projectionPath(root: string): string { return resolveInside(root, "sessions/creative-journey-projection.json"); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const projectionLocks = new Map<string, Promise<void>>();

async function withProjectionLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = projectionLocks.get(root) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  projectionLocks.set(root, current);
  await previous;
  try { return await operation(); } finally { release(); if (projectionLocks.get(root) === current) projectionLocks.delete(root); }
}

export function assertCreativeJourneyProjectionIntegrity(projection: CreativeJourneyProjection, expectedProjectSlug?: string): CreativeJourneyProjection {
  const { fingerprint: _fingerprint, ...base } = projection;
  const valid = projection.schemaVersion === "creative-journey-projection.v1"
    && (!expectedProjectSlug || projection.projectSlug === expectedProjectSlug)
    && Boolean(projection.projectSlug?.trim() && projection.sessionFingerprint?.trim() && projection.sourceFingerprint?.trim() && projection.projectionVersion?.trim())
    && Array.isArray(projection.sourceMessageIds) && projection.sourceMessageIds.every((id) => typeof id === "string" && id.trim())
    && Array.isArray(projection.pendingRefs) && projection.pendingRefs.every((ref) => typeof ref === "string" && ref.trim())
    && ["capture", "understanding"].includes(projection.stage)
    && ["creative-session", "understanding-preview"].includes(projection.primaryAsset)
    && (projection.primaryAction?.id === "capture-idea" || projection.primaryAction?.id === "review-understanding" || projection.primaryAction?.id.startsWith("answer-"))
    && ["capture", "review", "answer"].includes(projection.primaryAction?.kind)
    && ["current", "rebuilding", "conflicted"].includes(projection.freshness)
    && typeof projection.unsavedState?.hasDraft === "boolean"
    && /^[a-f0-9]{64}$/i.test(projection.fingerprint)
    && hash(base) === projection.fingerprint;
  if (!valid) throw new Error("CREATIVE_JOURNEY_PROJECTION_INTEGRITY_FAILED");
  return projection;
}

export async function persistCreativeJourneyProjection(root: string, projection: CreativeJourneyProjection): Promise<CreativeJourneyProjection> {
  assertCreativeJourneyProjectionIntegrity(projection);
  return withProjectionLock(root, async () => {
    const target = projectionPath(root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
    return projection;
  });
}

export async function readCreativeJourneyProjection(root: string, projectSlug: string): Promise<CreativeJourneyProjection | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(projectionPath(root), "utf8")) as CreativeJourneyProjection;
    return assertCreativeJourneyProjectionIntegrity(parsed, projectSlug);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
