import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { ForgetPropagationResult } from "./memoryForgetPropagation.js";

export interface MemoryForgetTombstone {
  schemaVersion: "memory-forget-tombstone.v1";
  tombstoneId: string;
  projectSlug: string;
  memoryId: string;
  scope: "scene" | "chapter" | "project";
  scopeId: string;
  status: "forgotten";
  reason: string;
  publishedVersionRefs: string[];
  indexAction: "remove";
  cacheAction: "invalidate";
  futureContextAction: "exclude";
  historyAction: "preserve";
  contentIncluded: false;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const filePath = (root: string, tombstoneId: string) => resolveInside(root, `memory/forget-tombstones/${tombstoneId}.json`);

function assertIntegrity(tombstone: MemoryForgetTombstone): MemoryForgetTombstone {
  const { fingerprint, ...base } = tombstone;
  if (tombstone.schemaVersion !== "memory-forget-tombstone.v1" || !/^memory-forget-[a-f0-9]{24}$/.test(tombstone.tombstoneId) || !tombstone.projectSlug.trim() || !tombstone.memoryId.trim() || !tombstone.scopeId.trim() || !tombstone.reason.trim() || tombstone.status !== "forgotten" || tombstone.contentIncluded !== false || !Array.isArray(tombstone.publishedVersionRefs) || !tombstone.publishedVersionRefs.every((ref) => typeof ref === "string" && ref.trim()) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("MEMORY_FORGET_TOMBSTONE_INTEGRITY_FAILED");
  return tombstone;
}

export async function persistMemoryForget(root: string, projectSlug: string, propagation: ForgetPropagationResult, publishedVersionRefs: readonly string[]): Promise<MemoryForgetTombstone> {
  if (!projectSlug.trim()) throw new Error("MEMORY_FORGET_PROJECT_REQUIRED");
  const base = { schemaVersion: "memory-forget-tombstone.v1" as const, tombstoneId: "", projectSlug: projectSlug.trim(), memoryId: propagation.memory.memoryId, scope: propagation.memory.scope, scopeId: propagation.memory.scopeId, status: "forgotten" as const, reason: propagation.tombstone.reason, publishedVersionRefs: [...new Set(publishedVersionRefs)].sort(), indexAction: propagation.indexAction, cacheAction: propagation.cacheAction, futureContextAction: propagation.futureContextAction, historyAction: propagation.historyAction, contentIncluded: false as const, createdAt: new Date().toISOString() };
  const tombstoneId = `memory-forget-${hash({ ...base, createdAt: undefined }).slice(0, 24)}`;
  const withId = { ...base, tombstoneId };
  const tombstone = { ...withId, fingerprint: hash(withId) };
  const target = filePath(root, tombstoneId);
  try {
    const existing = assertIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as MemoryForgetTombstone);
    if (existing.fingerprint !== tombstone.fingerprint) throw new Error("MEMORY_FORGET_TOMBSTONE_CONFLICT");
    return existing;
  } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(tombstone, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return tombstone;
}

export async function readMemoryForget(root: string, tombstoneId: string): Promise<MemoryForgetTombstone | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(filePath(root, tombstoneId), "utf8")) as MemoryForgetTombstone); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
