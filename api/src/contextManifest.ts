import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCreativeSession, type CreativeSession } from "./creativeSession.js";

export interface ContextManifestMessage {
  id: string;
  role: "author" | "system" | "task";
  sourceKind: "author" | "system-paraphrase" | "system-inference" | "task-result";
  text: string;
  sourceSpan: { start: number; end: number };
}

export interface ContextManifestBlock {
  id: string;
  tier: "T0" | "T1" | "T2" | "T3";
  sourceRefs: string[];
  sourceVersion: string;
  sourceHash: string;
  originalTokens: number;
  finalTokens: number;
  compression: "none" | "source-covered";
  permission: "author" | "system" | "task";
  selected: boolean;
  exclusionReason?: string;
}

export interface ContextManifest {
  schemaVersion: "context-manifest.v1";
  manifestId: string;
  projectSlug: string;
  purpose: "understanding";
  sourceSessionId: string;
  sourceFingerprint: string;
  sourceMessages: ContextManifestMessage[];
  blocks: ContextManifestBlock[];
  frozenAt: string;
  supersedesManifestId?: string;
  fingerprint?: string;
}

interface FreezeResult {
  manifest: ContextManifest;
  created: boolean;
}

const locks = new Map<string, Promise<void>>();

function manifestPath(root: string): string {
  return resolveInside(root, "sessions/context-manifest.json");
}

export function fingerprintCreativeSession(session: CreativeSession): string {
  return crypto.createHash("sha256").update(JSON.stringify({ schemaVersion: session.schemaVersion, messages: session.messages })).digest("hex");
}

export function fingerprintContextManifest(manifest: ContextManifest): string {
  const { frozenAt: _frozenAt, fingerprint: _fingerprint, ...stable } = manifest;
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function assertContextManifestIntegrity(manifest: ContextManifest): ContextManifest {
  if (manifest.schemaVersion !== "context-manifest.v1" || !manifest.manifestId.trim() || !manifest.projectSlug.trim() || !manifest.sourceSessionId.trim() || !manifest.sourceFingerprint.trim() || !manifest.frozenAt.trim() || !Array.isArray(manifest.sourceMessages) || !Array.isArray(manifest.blocks)) throw new Error("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  if (manifest.sourceMessages.some((message) => !message.id.trim() || !message.text.trim() || !["author", "system", "task"].includes(message.role) || !["author", "system-paraphrase", "system-inference", "task-result"].includes(message.sourceKind) || !Number.isInteger(message.sourceSpan.start) || !Number.isInteger(message.sourceSpan.end) || message.sourceSpan.start < 0 || message.sourceSpan.end < message.sourceSpan.start)) throw new Error("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  if (manifest.blocks.some((block) => !block.id.trim() || !["T0", "T1", "T2", "T3"].includes(block.tier) || !block.sourceRefs.length || block.sourceRefs.some((ref) => !ref.trim()) || !block.sourceVersion.trim() || !block.sourceHash.trim() || !Number.isInteger(block.originalTokens) || !Number.isInteger(block.finalTokens) || block.originalTokens < 0 || block.finalTokens < 0 || block.finalTokens > block.originalTokens || !["none", "source-covered"].includes(block.compression) || !["author", "system", "task"].includes(block.permission) || (!block.selected && !block.exclusionReason?.trim()))) throw new Error("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  if (manifest.fingerprint !== undefined && (!/^[a-f0-9]{64}$/i.test(manifest.fingerprint) || fingerprintContextManifest(manifest) !== manifest.fingerprint)) throw new Error("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  return manifest;
}

async function readManifest(root: string): Promise<ContextManifest | null> {
  try {
    return assertContextManifestIntegrity(JSON.parse(await fs.readFile(manifestPath(root), "utf8")) as ContextManifest);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function writeManifest(root: string, manifest: ContextManifest): Promise<void> {
  const target = manifestPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function withLock<T>(projectSlug: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectSlug) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(projectSlug, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(projectSlug) === current) locks.delete(projectSlug);
  }
}

export async function freezeContextManifest(root: string, projectSlug: string): Promise<FreezeResult> {
  return withLock(projectSlug, async () => {
    const session = await readCreativeSession(root, projectSlug);
    const sourceFingerprint = fingerprintCreativeSession(session);
    const existing = await readManifest(root);
    if (existing?.sourceFingerprint === sourceFingerprint) return { manifest: existing, created: false };

    const manifestId = `context-${sourceFingerprint.slice(0, 16)}`;
    const sourceMessages = session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      sourceKind: message.source.kind,
      text: message.text,
      sourceSpan: { start: 0, end: message.text.length }
    }));
    const baseManifest: Omit<ContextManifest, "fingerprint"> = {
      schemaVersion: "context-manifest.v1",
      manifestId,
      projectSlug,
      purpose: "understanding",
      sourceSessionId: session.sessionId,
      sourceFingerprint,
      sourceMessages,
      blocks: sourceMessages.map((message) => ({
        id: message.id,
        tier: message.role === "author" ? "T0" : "T1",
        sourceRefs: [message.id],
        sourceVersion: sourceFingerprint,
        sourceHash: crypto.createHash("sha256").update(message.text, "utf8").digest("hex"),
        originalTokens: Math.ceil(message.text.length / 4),
        finalTokens: Math.ceil(message.text.length / 4),
        compression: "none",
        permission: message.role,
        selected: true
      })),
      frozenAt: new Date().toISOString(),
      ...(existing ? { supersedesManifestId: existing.manifestId } : {})
    };
    const manifest: ContextManifest = { ...baseManifest, fingerprint: fingerprintContextManifest(baseManifest) };
    await writeManifest(root, manifest);
    return { manifest, created: true };
  });
}

export async function readContextManifest(root: string, options?: { allowLegacyExecutionMetadata?: boolean }): Promise<ContextManifest | null> {
  try {
    return await readManifest(root);
  } catch (error) {
    if (!options?.allowLegacyExecutionMetadata) throw error;
    try {
      const legacy = JSON.parse(await fs.readFile(manifestPath(root), "utf8")) as { manifestId?: unknown; sourceFingerprint?: unknown };
      if (typeof legacy.manifestId === "string" && legacy.manifestId.trim() && typeof legacy.sourceFingerprint === "string" && legacy.sourceFingerprint.trim()) return legacy as ContextManifest;
    } catch { /* preserve the original integrity failure */ }
    throw error;
  }
}
