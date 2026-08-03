import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlement } from "./chapterSettlement.js";
import { recordChapterSettlementProjectionClosure } from "./chapterSettlementProjectionClosure.js";

export interface DerivedPublicationTransaction {
  schemaVersion: "derived-publication-transaction.v1";
  transactionId: string;
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  writes: Array<{ relativePath: string; contentSha256: string }>;
  status: "prepared" | "committed" | "rolled_back" | "stale";
  createdAt: string;
  committedAt?: string;
  error?: string;
  staleReason?: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function verifyTransactionIntegrity(transaction: DerivedPublicationTransaction): boolean {
  const { fingerprint, ...base } = transaction;
  const writesValid = Array.isArray(transaction.writes) && transaction.writes.length > 0 && transaction.writes.every((write) => typeof write?.relativePath === "string" && write.relativePath.trim() && typeof write.contentSha256 === "string" && /^[a-f0-9]{64}$/i.test(write.contentSha256));
  const statusValid = ["prepared", "committed", "rolled_back", "stale"].includes(transaction.status);
  const datesValid = typeof transaction.createdAt === "string" && Number.isFinite(Date.parse(transaction.createdAt)) && (transaction.committedAt === undefined || Number.isFinite(Date.parse(transaction.committedAt)));
  return transaction.schemaVersion === "derived-publication-transaction.v1" && typeof transaction.transactionId === "string" && transaction.transactionId.trim().length > 0 && typeof transaction.projectSlug === "string" && transaction.projectSlug.trim().length > 0 && typeof transaction.chapterId === "string" && transaction.chapterId.trim().length > 0 && typeof transaction.settlementId === "string" && transaction.settlementId.trim().length > 0 && writesValid && statusValid && datesValid && (transaction.status !== "committed" || typeof transaction.committedAt === "string") && hash(base) === fingerprint;
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
  try {
    const transaction = JSON.parse(await fs.readFile(transactionPath(root, id), "utf8")) as DerivedPublicationTransaction;
    if (transaction.schemaVersion !== "derived-publication-transaction.v1" || transaction.transactionId !== id || !/^[a-f0-9]{64}$/i.test(transaction.fingerprint) || !verifyTransactionIntegrity(transaction)) throw new Error("DERIVED_PUBLICATION_INTEGRITY_FAILED");
    return transaction;
  }
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
      if (existing.projectSlug !== input.projectSlug || existing.chapterId !== input.chapterId || existing.settlementId !== input.settlementId) throw new Error("DERIVED_PUBLICATION_CONFLICT");
      if (existing.status === "stale") throw new Error("DERIVED_PUBLICATION_REVALIDATION_REQUIRED");
      if (existing.status === "committed") {
        for (const write of existing.writes) {
          let content: string;
          try { content = await fs.readFile(resolveInside(input.root, write.relativePath), "utf8"); }
          catch { throw new Error("DERIVED_PUBLICATION_OUTPUT_STALE"); }
          if (hashText(content) !== write.contentSha256) throw new Error("DERIVED_PUBLICATION_OUTPUT_STALE");
        }
        await recordChapterSettlementProjectionClosure({ root: input.root, projectSlug: input.projectSlug, chapterId: input.chapterId, settlementId: input.settlementId, derivedTransactionId: existing.transactionId, derivedFingerprint: existing.fingerprint });
      }
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
      await recordChapterSettlementProjectionClosure({ root: input.root, projectSlug: input.projectSlug, chapterId: input.chapterId, settlementId: input.settlementId, derivedTransactionId: committed.transactionId, derivedFingerprint: committed.fingerprint });
      return committed;
    } catch (error) {
      for (const [relativePath, original] of originals) {
        if (original.exists) await writeText(resolveInside(input.root, relativePath), original.content);
        else await fs.rm(resolveInside(input.root, relativePath), { force: true });
      }
      const { fingerprint: _preparedRollbackFingerprint, ...preparedRollbackBase } = prepared;
      const rolledBackBase = { ...preparedRollbackBase, status: "rolled_back" as const, error: error instanceof Error ? error.message : String(error) };
      const rolledBack: DerivedPublicationTransaction = { ...rolledBackBase, fingerprint: hash(rolledBackBase) };
      await writeJson(transactionPath(input.root, transactionId), rolledBack);
      throw error;
    }
  });
}

export async function invalidateDerivedPublications(root: string, claimId: string, reason: string): Promise<string[]> {
  if (!claimId.trim() || !reason.trim()) throw new Error("DERIVED_PUBLICATION_INVALIDATION_FIELDS_REQUIRED");
  return withLock(root, async () => {
    const directory = resolveInside(root, "sessions/derived-publications");
    let names: string[];
    try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
    const invalidated: string[] = [];
    for (const name of names.filter((item) => item.endsWith(".json"))) {
      const id = name.slice(0, -5);
      const transaction = await readDerivedPublicationTransaction(root, id);
      if (!transaction || transaction.status !== "committed") continue;
      const { fingerprint: _fingerprint, ...base } = transaction;
      const staleBase = { ...base, status: "stale" as const, staleReason: `${claimId}:${reason}` };
      await writeJson(transactionPath(root, id), { ...staleBase, fingerprint: hash(staleBase) });
      invalidated.push(id);
    }
    return invalidated.sort();
  });
}

export async function revalidateDerivedPublication(root: string, transactionId: string, writes: Array<{ relativePath: string; content: string }>): Promise<DerivedPublicationTransaction> {
  const stale = await readDerivedPublicationTransaction(root, transactionId);
  if (!stale) throw new Error("DERIVED_PUBLICATION_TRANSACTION_NOT_FOUND");
  if (stale.status !== "stale") throw new Error("DERIVED_PUBLICATION_REVALIDATION_NOT_REQUIRED");
  return publishDerivedAssets({ root, projectSlug: stale.projectSlug, chapterId: stale.chapterId, settlementId: stale.settlementId, writes });
}
