import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseCandidate, type ProseCandidate } from "./proseCandidate.js";
import { validateAndPersistProseCandidate } from "./proseValidation.js";
import { reviewProseCandidate } from "./proseReview.js";
import type { RedBlueReview } from "./proseReview.js";

export interface ProseAdoptionTransaction {
  schemaVersion: "prose-adoption-transaction.v1";
  transactionId: string;
  candidateId: string;
  targetPath: string;
  expectedCanonSha256: string;
  adoptedSha256: string;
  authorizationId: string;
  reviewFingerprint: string;
  reviewVerdict: RedBlueReview["verdict"];
  status: "prepared" | "committed" | "rolled_back" | "blocked";
  createdAt: string;
  committedAt?: string;
  error?: string;
  fingerprint: string;
}

const locks = new Map<string, Promise<void>>();

function hashBytes(content: string): string { return crypto.createHash("sha256").update(content, "utf8").digest("hex"); }
function hashValue(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function transactionPath(root: string, transactionId: string): string { return resolveInside(root, `sessions/prose-adoptions/${transactionId}.json`); }
function candidatePath(root: string, candidateId: string): string { return resolveInside(root, `sessions/prose-candidates/${candidateId}.json`); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function readTextOrEmpty(target: string): Promise<string> {
  try { return await fs.readFile(target, "utf8"); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return ""; throw error; }
}

async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(root, current);
  await previous;
  try { return await operation(); } finally { release(); if (locks.get(root) === current) locks.delete(root); }
}

export async function readProseAdoptionTransaction(root: string, transactionId: string): Promise<ProseAdoptionTransaction | null> {
  try { return JSON.parse(await fs.readFile(transactionPath(root, transactionId), "utf8")) as ProseAdoptionTransaction; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function adoptProseCandidate(input: {
  root: string;
  candidateId: string;
  targetPath: string;
  expectedCanonSha256: string;
  authorizationId: string;
  faultAt?: "after-target-write";
}): Promise<ProseAdoptionTransaction> {
  const transactionId = `adopt-${input.candidateId}-${hashValue({ targetPath: input.targetPath, expectedCanonSha256: input.expectedCanonSha256, authorizationId: input.authorizationId }).slice(0, 16)}`;
  return withLock(input.root, async () => {
    const existing = await readProseAdoptionTransaction(input.root, transactionId);
    if (existing) return existing;
    const candidate = await readProseCandidate(input.root, input.candidateId);
    if (!candidate) throw new Error("PROSE_CANDIDATE_NOT_FOUND");
    const validation = await validateAndPersistProseCandidate(input.root, candidate);
    if (validation.status !== "passed") throw new Error(`PROSE_CANDIDATE_VALIDATION_${validation.hardFailures.join("_")}`);
    const review = await reviewProseCandidate(input.root, candidate, validation);
    if (review.status !== "passed" || review.verdict !== "supports-adoption") throw new Error(`PROSE_CANDIDATE_REVIEW_${review.redFindings.map((finding) => finding.findingId).join("_") || review.verdict}`);
    const target = resolveInside(input.root, input.targetPath);
    const original = await readTextOrEmpty(target);
    if (hashBytes(original) !== input.expectedCanonSha256) throw new Error("PROSE_CANON_BASELINE_STALE");
    const adoptedContent = candidate.content;
    const base = {
      schemaVersion: "prose-adoption-transaction.v1" as const,
      transactionId,
      candidateId: candidate.candidateId,
      targetPath: input.targetPath,
      expectedCanonSha256: input.expectedCanonSha256,
      adoptedSha256: hashBytes(adoptedContent),
      authorizationId: input.authorizationId,
      reviewFingerprint: review.fingerprint,
      reviewVerdict: review.verdict,
      status: "prepared" as const,
      createdAt: new Date().toISOString()
    };
    const prepared: ProseAdoptionTransaction = { ...base, fingerprint: hashValue(base) };
    await writeJson(transactionPath(input.root, transactionId), prepared);
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temp, adoptedContent, "utf8");
      await fs.rename(temp, target);
      if (input.faultAt === "after-target-write") throw new Error("FAULT_AFTER_TARGET_WRITE");
      const adoptedCandidate: ProseCandidate = { ...candidate, status: "adopted", updatedAt: new Date().toISOString() };
      const { fingerprint: _old, ...candidateWithoutFingerprint } = adoptedCandidate;
      await writeJson(candidatePath(input.root, candidate.candidateId), { ...candidateWithoutFingerprint, fingerprint: hashValue(candidateWithoutFingerprint) });
      const committedBase = { ...prepared, status: "committed" as const, committedAt: new Date().toISOString() };
      const committed: ProseAdoptionTransaction = { ...committedBase, fingerprint: hashValue(committedBase) };
      await writeJson(transactionPath(input.root, transactionId), committed);
      return committed;
    } catch (error) {
      await writeText(target, original);
      const rolledBackBase = { ...prepared, status: "rolled_back" as const, error: error instanceof Error ? error.message : String(error) };
      const rolledBack: ProseAdoptionTransaction = { ...rolledBackBase, fingerprint: hashValue(rolledBackBase) };
      await writeJson(transactionPath(input.root, transactionId), rolledBack);
      throw error;
    }
  });
}

async function writeText(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, content, "utf8");
  await fs.rename(temp, target);
}
