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

export interface ContextManifest {
  schemaVersion: "context-manifest.v1";
  manifestId: string;
  projectSlug: string;
  purpose: "understanding";
  sourceSessionId: string;
  sourceFingerprint: string;
  sourceMessages: ContextManifestMessage[];
  frozenAt: string;
  supersedesManifestId?: string;
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

async function readManifest(root: string): Promise<ContextManifest | null> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(root), "utf8")) as ContextManifest;
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
    const manifest: ContextManifest = {
      schemaVersion: "context-manifest.v1",
      manifestId,
      projectSlug,
      purpose: "understanding",
      sourceSessionId: session.sessionId,
      sourceFingerprint,
      sourceMessages: session.messages.map((message) => ({
        id: message.id,
        role: message.role,
        sourceKind: message.source.kind,
        text: message.text,
        sourceSpan: { start: 0, end: message.text.length }
      })),
      frozenAt: new Date().toISOString(),
      ...(existing ? { supersedesManifestId: existing.manifestId } : {})
    };
    await writeManifest(root, manifest);
    return { manifest, created: true };
  });
}

export async function readContextManifest(root: string): Promise<ContextManifest | null> {
  return readManifest(root);
}
