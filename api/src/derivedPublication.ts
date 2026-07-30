import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlement } from "./chapterSettlement.js";

export interface DerivedPublicationTransaction {
  schemaVersion: "derived-publication-transaction.v1";
  transactionId: string;
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  writes: Array<{ relativePath: string; contentSha256: string }>;
  status: "prepared" | "committed" | "rolled_back";
  createdAt: string;
  committedAt?: string;
  error?: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function verifyTransactionIntegrity(transaction: DerivedPublicationTransaction): boolean {
  const { fingerprint, ...base } = transaction;
  return hash(base) === fingerprint;
}
function transactionPath(root: string, id: string): string { return resolveInside(root, `sessions/derived-publications/${id}.json`); }
function lockPath(root: string): string { return resolveInside(root, "sessions/derived-publications/.lock"); }
const locks = new Map<string, Promise<void>>();

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}
async function writeText(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, content, "utf8");
  await fs.rename(temp, target);
}
async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) || Promise.resolve(); let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; }); locks.set(root, current); await previous;
  let handle: fs.FileHandle | null = null;
  try {
    await fs.mkdir(path.dirname(lockPath(root)), { recursive: true });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { handle = await fs.open(lockPath(root), "wx"); break; }
      catch (error) {
        if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    if (!handle) throw new Error("DERIVED_PUBLICATION_LOCK_TIMEOUT");
    return await operation();
  } finally {
    if (handle) await handle.close(); await fs.rm(lockPath(root), { force: true });
    release(); if (locks.get(root) === current) locks.delete(root);
  }
}

export async function readDerivedPublicationTransaction(root: string, id: string): Promise<DerivedPublicationTransaction | null> {
  try { return JSON.parse(await fs.readFile(transactionPath(root, id), "utf8")) as DerivedPublicationTransaction; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function publishDerivedAssets(input: {
  root: string;
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  writes: Array<{ relativePath: string; content: string }>;
  faultAfterWrites?: number;
}): Promise<DerivedPublicationTransaction> {
  const transactionId = `derived-${input.settlementId}-${hash(input.writes.map((write) => ({ path: write.relativePath, content: write.content }))).slice(0, 16)}`;
  return withLock(input.root, async () => {
    const existing = await readDerivedPublicationTransaction(input.root, transactionId);
    if (existing) {
      if (!verifyTransactionIntegrity(existing)) throw new Error("DERIVED_PUBLICATION_INTEGRITY_FAILED");
      return existing;
    }
    const settlement = await readChapterSettlement(input.root, input.settlementId);
    if (!settlement || settlement.status !== "settled" || settlement.chapterId !== input.chapterId) throw new Error("DERIVED_PUBLICATION_SETTLEMENT_REQUIRED");
    if (!input.writes.length) throw new Error("DERIVED_PUBLICATION_WRITES_REQUIRED");
    const originals = new Map<string, { exists: boolean; content: string }>();
    for (const write of input.writes) {
      const target = resolveInside(input.root, write.relativePath);
      try { originals.set(write.relativePath, { exists: true, content: await fs.readFile(target, "utf8") }); }
      catch (error) {
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") originals.set(write.relativePath, { exists: false, content: "" });
        else throw error;
      }
    }
    const base = {
      schemaVersion: "derived-publication-transaction.v1" as const,
      transactionId,
      projectSlug: input.projectSlug,
      chapterId: input.chapterId,
      settlementId: input.settlementId,
      writes: input.writes.map((write) => ({ relativePath: write.relativePath, contentSha256: hashText(write.content) })),
      status: "prepared" as const,
      createdAt: new Date().toISOString()
    };
    const prepared: DerivedPublicationTransaction = { ...base, fingerprint: hash(base) };
    await writeJson(transactionPath(input.root, transactionId), prepared);
    try {
      for (const [index, write] of input.writes.entries()) {
        await writeText(resolveInside(input.root, write.relativePath), write.content);
        if (input.faultAfterWrites === index + 1) throw new Error("FAULT_DERIVED_PUBLICATION");
      }
      const { fingerprint: _preparedFingerprint, ...preparedWithoutFingerprint } = prepared;
      const committedBase = { ...preparedWithoutFingerprint, status: "committed" as const, committedAt: new Date().toISOString() };
      const committed: DerivedPublicationTransaction = { ...committedBase, fingerprint: hash(committedBase) };
      await writeJson(transactionPath(input.root, transactionId), committed);
      return committed;
    } catch (error) {
      for (const [relativePath, original] of originals) {
        if (original.exists) await writeText(resolveInside(input.root, relativePath), original.content);
        else await fs.rm(resolveInside(input.root, relativePath), { force: true });
      }
      const rolledBackBase = { ...prepared, status: "rolled_back" as const, error: error instanceof Error ? error.message : String(error) };
      const rolledBack: DerivedPublicationTransaction = { ...rolledBackBase, fingerprint: hash(rolledBackBase) };
      await writeJson(transactionPath(input.root, transactionId), rolledBack);
      throw error;
    }
  });
}
