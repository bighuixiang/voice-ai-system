import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseAdoptionTransaction, type ProseAdoptionTransaction } from "./proseAdoption.js";
import { readBookWorkGraph, refreshBookWorkGraph } from "./bookWorkGraph.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";
import { assertQualityGateCurrent } from "./qualityGateDecision.js";
import { readChapterExecutionProof } from "./chapterExecutionProof.js";

export interface ChapterSettlement {
  schemaVersion: "chapter-settlement.v1";
  settlementId: string;
  projectSlug: string;
  chapterId: string;
  adoptionTransactionId: string;
  adoptedContentSha256: string;
  status: "settled" | "blocked";
  nextAction: "schedule_dependency_ready_work" | "manual_review";
  evidence?: ChapterSettlementEvidence;
  evidenceFingerprint?: string;
  chapterExecutionProofId?: string;
  chapterExecutionProofFingerprint?: string;
  createdAt: string;
  fingerprint: string;
}

export interface ChapterSettlementEvidence {
  adoptionReceiptRef: string;
  summaryRef: string;
  obligationDeltaRef: string;
  projectionRef: string;
  feedbackRef: string;
  costRef: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function evidenceFingerprint(evidence: ChapterSettlementEvidence): string { return hash(evidence); }
function validEvidenceRef(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && (/^(waiver|[a-z][a-z0-9+.-]*):/i.test(value) || value.includes("/") || value.includes("://")); }
function verifySettlementSemantics(settlement: ChapterSettlement): boolean {
  const evidenceValid = !settlement.evidence || Object.values(settlement.evidence).every(validEvidenceRef) && typeof settlement.evidenceFingerprint === "string" && settlement.evidenceFingerprint === evidenceFingerprint(settlement.evidence);
  return settlement.schemaVersion === "chapter-settlement.v1" && typeof settlement.settlementId === "string" && settlement.settlementId.trim().length > 0 && typeof settlement.projectSlug === "string" && settlement.projectSlug.trim().length > 0 && typeof settlement.chapterId === "string" && settlement.chapterId.trim().length > 0 && typeof settlement.adoptionTransactionId === "string" && settlement.adoptionTransactionId.trim().length > 0 && typeof settlement.adoptedContentSha256 === "string" && /^[a-f0-9]{64}$/i.test(settlement.adoptedContentSha256) && (settlement.chapterExecutionProofId === undefined || (typeof settlement.chapterExecutionProofId === "string" && settlement.chapterExecutionProofId.trim().length > 0 && typeof settlement.chapterExecutionProofFingerprint === "string" && /^[a-f0-9]{64}$/i.test(settlement.chapterExecutionProofFingerprint))) && ((settlement.status === "settled" && settlement.nextAction === "schedule_dependency_ready_work") || (settlement.status === "blocked" && settlement.nextAction === "manual_review")) && typeof settlement.createdAt === "string" && settlement.createdAt.trim().length > 0 && evidenceValid;
}
export function assertChapterSettlementIntegrity(settlement: ChapterSettlement, expectedId?: string): ChapterSettlement {
  const { fingerprint, ...base } = settlement;
  if ((expectedId && settlement.settlementId !== expectedId) || !/^[a-f0-9]{64}$/i.test(settlement.fingerprint) || hash(base) !== fingerprint) throw new Error("CHAPTER_SETTLEMENT_INTEGRITY_FAILED");
  if (!verifySettlementSemantics(settlement)) throw new Error("CHAPTER_SETTLEMENT_SEMANTIC_INVALID");
  return settlement;
}
function settlementPath(root: string, settlementId: string): string { return resolveInside(root, `sessions/chapter-settlements/${settlementId}.json`); }
async function discoverEvidenceRef(root: string, relativePath: string): Promise<string | undefined> {
  try { await fs.access(resolveInside(root, relativePath)); return relativePath; } catch { return undefined; }
}
async function discoverFeedbackRef(root: string, adoptionTransactionId: string): Promise<string | undefined> {
  const directory = resolveInside(root, "sessions/author-feedback");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const event = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as { adoptionTransactionId?: string; fingerprint?: string };
      if (event.adoptionTransactionId === adoptionTransactionId && event.fingerprint) return `sessions/author-feedback/${name}`;
    } catch { /* malformed evidence is not discoverable */ }
  }
  return undefined;
}
async function discoverDerivedProjectionRef(root: string, settlementId: string, chapterId: string): Promise<string | undefined> {
  const directory = resolveInside(root, "sessions/derived-publications");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const transaction = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as { settlementId?: string; chapterId?: string; status?: string };
      if (transaction.settlementId === settlementId && transaction.chapterId === chapterId && transaction.status === "committed") return `sessions/derived-publications/${name}`;
    } catch { /* malformed evidence is not discoverable */ }
  }
  return undefined;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readChapterSettlement(root: string, settlementId: string): Promise<ChapterSettlement | null> {
  try {
    const settlement = JSON.parse(await fs.readFile(settlementPath(root, settlementId), "utf8")) as ChapterSettlement;
    return assertChapterSettlementIntegrity(settlement, settlementId);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function hasSettledChapterSettlement(root: string, projectSlug: string, chapterId: string): Promise<boolean> {
  const directory = resolveInside(root, "sessions/chapter-settlements");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const settlement = await readChapterSettlement(root, name.slice(0, -5));
      if (settlement?.projectSlug === projectSlug && settlement.chapterId === chapterId && settlement.status === "settled") return true;
    } catch { /* malformed settlement is not evidence */ }
  }
  return false;
}

export async function settleChapter(input: {
  root: string;
  projectSlug: string;
  chapterId: string;
  adoptionTransactionId: string;
  targetPath: string;
  qualityGateDecisionId?: string;
  qualityGateSourceFingerprint?: string;
  strictEvidence?: boolean;
  evidence?: Partial<Omit<ChapterSettlementEvidence, "adoptionReceiptRef">>;
  chapterExecutionProofId?: string;
  chapterExecutionProofFingerprint?: string;
}): Promise<ChapterSettlement> {
  const settlementId = `settlement-${input.chapterId}-${input.adoptionTransactionId}`;
  const existing = await readChapterSettlement(input.root, settlementId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug || existing.chapterId !== input.chapterId || existing.adoptionTransactionId !== input.adoptionTransactionId) throw new Error("CHAPTER_SETTLEMENT_CONFLICT");
    const replayContent = await fs.readFile(resolveInside(input.root, input.targetPath), "utf8");
    if (hashText(replayContent) !== existing.adoptedContentSha256) throw new Error("CHAPTER_SETTLEMENT_CONTENT_STALE");
    return existing;
  }
  const transaction = await readProseAdoptionTransaction(input.root, input.adoptionTransactionId);
  if (!transaction || transaction.status !== "committed") throw new Error("CHAPTER_SETTLEMENT_ADOPTION_REQUIRED");
  const content = await fs.readFile(resolveInside(input.root, input.targetPath), "utf8");
  if (hashText(content) !== transaction.adoptedSha256) throw new Error("CHAPTER_SETTLEMENT_CONTENT_STALE");
  if (input.qualityGateDecisionId) {
    if (!input.qualityGateSourceFingerprint?.trim()) throw new Error("CHAPTER_SETTLEMENT_QUALITY_GATE_SOURCE_REQUIRED");
    await assertQualityGateCurrent(input.root, input.qualityGateDecisionId, {
      projectSlug: input.projectSlug,
      chapterId: input.chapterId,
      content,
      sourceFingerprint: input.qualityGateSourceFingerprint
    });
  }
  let chapterExecutionProofFingerprint = input.chapterExecutionProofFingerprint;
  if (input.chapterExecutionProofId) {
    const proof = await readChapterExecutionProof(input.root, input.chapterExecutionProofId);
    if (!proof || proof.projectSlug !== input.projectSlug || proof.chapterId !== input.chapterId) throw new Error("CHAPTER_SETTLEMENT_EXECUTION_PROOF_REQUIRED");
    if (chapterExecutionProofFingerprint && chapterExecutionProofFingerprint !== proof.fingerprint) throw new Error("CHAPTER_SETTLEMENT_EXECUTION_PROOF_STALE");
    chapterExecutionProofFingerprint = proof.fingerprint;
  }
  const discoveredSummaryRef = await discoverEvidenceRef(input.root, `memory/chapter-summaries/${input.chapterId}.json`);
  const discoveredFeedbackRef = await discoverFeedbackRef(input.root, transaction.transactionId);
  const discoveredObligationRef = await discoverEvidenceRef(input.root, "sessions/obligations/coverage-certificate.json");
  const discoveredProjectionRef = await discoverDerivedProjectionRef(input.root, settlementId, input.chapterId);
  const discoveredCostRef = await discoverEvidenceRef(input.root, "sessions/model-invocations.jsonl");
  const evidence: ChapterSettlementEvidence = {
    adoptionReceiptRef: `sessions/prose-adoptions/${transaction.transactionId}.json`,
    summaryRef: input.evidence?.summaryRef || discoveredSummaryRef || "waiver:summary-not-supplied",
    obligationDeltaRef: input.evidence?.obligationDeltaRef || discoveredObligationRef || "waiver:obligation-delta-not-supplied",
    projectionRef: input.evidence?.projectionRef || discoveredProjectionRef || "waiver:projection-not-supplied",
    feedbackRef: input.evidence?.feedbackRef || discoveredFeedbackRef || "waiver:feedback-not-supplied",
    costRef: input.evidence?.costRef || discoveredCostRef || "waiver:cost-not-supplied"
  };
  if (input.strictEvidence && Object.entries(evidence).some(([key, value]) => key !== "adoptionReceiptRef" && value.startsWith("waiver:"))) throw new Error("CHAPTER_SETTLEMENT_EVIDENCE_REQUIRED");
  const base = {
    schemaVersion: "chapter-settlement.v1" as const,
    settlementId,
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    adoptionTransactionId: transaction.transactionId,
    adoptedContentSha256: transaction.adoptedSha256,
    status: "settled" as const,
    nextAction: "schedule_dependency_ready_work" as const,
    evidence,
    evidenceFingerprint: evidenceFingerprint(evidence),
    ...(input.chapterExecutionProofId ? { chapterExecutionProofId: input.chapterExecutionProofId, chapterExecutionProofFingerprint } : {}),
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
