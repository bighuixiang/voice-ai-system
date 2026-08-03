import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertChapterSettlementIntegrity, type ChapterSettlement } from "./chapterSettlement.js";
import { listMemoryClaims } from "./memoryClaim.js";
import { listMemoryEntities } from "./memoryEntity.js";
import { listCharacterKnowledgeStates, listReaderKnowledgeStates } from "./memoryKnowledge.js";

export interface MemoryHealthReport {
  schemaVersion: "memory-health-report.v1";
  reportId: string;
  projectSlug: string;
  status: "healthy" | "degraded" | "blocked";
  coverage: { totalChapters: number; settledChapters: number; eligibleClaims: number; contestedClaims: number; obsoleteClaims: number; entityCount: number; timeBoundClaims: number; characterKnowledgeEntries: number; readerKnowledgeEntries: number };
  staleProjectionCount: number;
  invalidSettlementIds: string[];
  risks: string[];
  sourceRefs: string[];
  generatedAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reportPath = (root: string, reportId: string) => resolveInside(root, `memory/health-reports/${reportId}.json`);
const validProjectSlug = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function assertIntegrity(report: MemoryHealthReport): MemoryHealthReport {
  const { fingerprint, ...base } = report;
  if (report.schemaVersion !== "memory-health-report.v1" || !validProjectSlug(report.projectSlug) || !validProjectSlug(report.reportId) || !["healthy", "degraded", "blocked"].includes(report.status) || !Array.isArray(report.risks) || !Array.isArray(report.invalidSettlementIds) || !Array.isArray(report.sourceRefs) || !/^memory-health-[a-f0-9]{24}$/.test(report.reportId) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("MEMORY_HEALTH_REPORT_INTEGRITY_FAILED");
  return report;
}

async function listSettlements(root: string): Promise<{ valid: ChapterSettlement[]; invalidIds: string[] }> {
  const directory = resolveInside(root, "sessions/chapter-settlements");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const valid: ChapterSettlement[] = [];
  const invalidIds: string[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const id = name.slice(0, -5);
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as ChapterSettlement;
      valid.push(assertChapterSettlementIntegrity(parsed, id));
    } catch { invalidIds.push(id); }
  }
  return { valid, invalidIds };
}

async function countStaleProjections(root: string): Promise<number> {
  try {
    const lines = (await fs.readFile(resolveInside(root, "memory/retcon-invalidations.jsonl"), "utf8")).split(/\r?\n/).filter(Boolean);
    return lines.reduce((count, line) => { try { return count + (JSON.parse(line).status === "stale-until-downstream-revalidation" ? 1 : 0); } catch { return count + 1; } }, 0);
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return 0; throw error; }
}

export async function buildMemoryHealthReport(root: string, input: { projectSlug: string; chapterIds: string[] }): Promise<MemoryHealthReport> {
  if (!validProjectSlug(input.projectSlug) || !Array.isArray(input.chapterIds) || input.chapterIds.some((id) => !validProjectSlug(id))) throw new Error("MEMORY_HEALTH_INPUT_INVALID");
  const settlements = await listSettlements(root);
  const settledChapterIds = new Set(settlements.valid.filter((item) => item.status === "settled" && item.projectSlug === input.projectSlug).map((item) => item.chapterId));
  const claims = await listMemoryClaims(root);
  const [entities, characterKnowledge, readerKnowledge] = await Promise.all([listMemoryEntities(root), listCharacterKnowledgeStates(root), listReaderKnowledgeStates(root)]);
  const staleProjectionCount = await countStaleProjections(root);
  const coverage = { totalChapters: input.chapterIds.length, settledChapters: settledChapterIds.size, eligibleClaims: claims.filter((claim) => claim.status === "eligible").length, contestedClaims: claims.filter((claim) => claim.status === "contested").length, obsoleteClaims: claims.filter((claim) => claim.status === "obsolete").length, entityCount: entities.length, timeBoundClaims: claims.filter((claim) => Boolean(claim.temporalScope.startEvent || claim.temporalScope.endEvent)).length, characterKnowledgeEntries: characterKnowledge.length, readerKnowledgeEntries: readerKnowledge.length };
  const risks = [...(coverage.settledChapters < coverage.totalChapters ? ["chapter-coverage"] : []), ...(settlements.invalidIds.length ? ["settlement-integrity"] : []), ...(coverage.contestedClaims ? ["memory-contradiction"] : []), ...(staleProjectionCount ? ["stale-projection"] : [])];
  const status = settlements.invalidIds.length ? "blocked" as const : risks.length ? "degraded" as const : "healthy" as const;
  const sourceRefs = [...settlements.valid.filter((item) => item.projectSlug === input.projectSlug).map((item) => `sessions/chapter-settlements/${item.settlementId}.json`), ...(claims.length ? ["memory/claims/current.json"] : []), ...(staleProjectionCount ? ["memory/retcon-invalidations.jsonl"] : [])].sort();
  const base = { schemaVersion: "memory-health-report.v1" as const, reportId: "", projectSlug: input.projectSlug.trim(), status, coverage, staleProjectionCount, invalidSettlementIds: settlements.invalidIds.sort(), risks: [...new Set(risks)], sourceRefs, generatedAt: new Date().toISOString() };
  const reportId = `memory-health-${hash({ ...base, generatedAt: undefined }).slice(0, 24)}`;
  const withId = { ...base, reportId };
  return { ...withId, fingerprint: hash(withId) };
}

export async function persistMemoryHealthReport(root: string, report: MemoryHealthReport): Promise<MemoryHealthReport> {
  assertIntegrity(report);
  const target = reportPath(root, report.reportId);
  try {
    const existing = assertIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as MemoryHealthReport);
    if (existing.fingerprint !== report.fingerprint) throw new Error("MEMORY_HEALTH_REPORT_CONFLICT");
    return existing;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return report;
}

export async function readMemoryHealthReport(root: string, reportId: string): Promise<MemoryHealthReport | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(reportPath(root, reportId), "utf8")) as MemoryHealthReport); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
