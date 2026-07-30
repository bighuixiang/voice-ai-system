import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseAdoptionTransaction, type ProseAdoptionTransaction } from "./proseAdoption.js";
import { readBookWorkGraph, refreshBookWorkGraph } from "./bookWorkGraph.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";

export interface ChapterSettlement {
  schemaVersion: "chapter-settlement.v1";
  settlementId: string;
  projectSlug: string;
  chapterId: string;
  adoptionTransactionId: string;
  adoptedContentSha256: string;
  status: "settled" | "blocked";
  nextAction: "schedule_dependency_ready_work" | "manual_review";
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function settlementPath(root: string, settlementId: string): string { return resolveInside(root, `sessions/chapter-settlements/${settlementId}.json`); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readChapterSettlement(root: string, settlementId: string): Promise<ChapterSettlement | null> {
  try { return JSON.parse(await fs.readFile(settlementPath(root, settlementId), "utf8")) as ChapterSettlement; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function settleChapter(input: {
  root: string;
  projectSlug: string;
  chapterId: string;
  adoptionTransactionId: string;
  targetPath: string;
}): Promise<ChapterSettlement> {
  const settlementId = `settlement-${input.chapterId}-${input.adoptionTransactionId}`;
  const existing = await readChapterSettlement(input.root, settlementId);
  if (existing) return existing;
  const transaction = await readProseAdoptionTransaction(input.root, input.adoptionTransactionId);
  if (!transaction || transaction.status !== "committed") throw new Error("CHAPTER_SETTLEMENT_ADOPTION_REQUIRED");
  const content = await fs.readFile(resolveInside(input.root, input.targetPath), "utf8");
  if (hashText(content) !== transaction.adoptedSha256) throw new Error("CHAPTER_SETTLEMENT_CONTENT_STALE");
  const base = {
    schemaVersion: "chapter-settlement.v1" as const,
    settlementId,
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    adoptionTransactionId: transaction.transactionId,
    adoptedContentSha256: transaction.adoptedSha256,
    status: "settled" as const,
    nextAction: "schedule_dependency_ready_work" as const,
    createdAt: new Date().toISOString()
  };
  const settlement: ChapterSettlement = { ...base, fingerprint: hash(base) };
  await writeJson(settlementPath(input.root, settlementId), settlement);
  if (await readBookWorkGraph(input.root)) {
    await refreshBookWorkGraph(input.root);
    await scheduleReadyExecutionWork(input.root, input.projectSlug);
  }
  return settlement;
}

export function settlementTransaction(transaction: ProseAdoptionTransaction): string { return transaction.transactionId; }
