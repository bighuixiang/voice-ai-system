import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface EvaluationRunArchive {
  schemaVersion: "evaluation-run-archive.v1";
  runId: string;
  suiteFingerprint: string;
  caseRefs: string[];
  candidateRefs: string[];
  inputFingerprint: string;
  modelVersion: string;
  promptVersion: string;
  contextFingerprint: string;
  evaluatorVersion: string;
  seeds: number[];
  usage: { inputTokens: number; outputTokens: number; costCents: number; latencyMs: number };
  rawJudgments: Array<{ evaluatorId: string; verdict: string; confidence: number; evidenceRefs: string[] }>;
  aggregationRule: string;
  releaseConclusion: "approved" | "blocked" | "experimental";
  reproducibility: "replayable" | "limited";
  evaluationScope?: "project-evaluation" | "platform-regression";
  accessGrantId?: string;
  limitationReason?: string;
  fingerprint: string;
}
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createEvaluationRunArchive(input: Omit<EvaluationRunArchive, "schemaVersion" | "fingerprint">): EvaluationRunArchive {
  if (!input.runId.trim() || !input.suiteFingerprint.trim() || !input.caseRefs.length || !input.candidateRefs.length || !input.inputFingerprint.trim() || !input.modelVersion.trim() || !input.promptVersion.trim() || !input.contextFingerprint.trim() || !input.evaluatorVersion.trim() || !input.seeds.length || input.seeds.some((seed) => !Number.isInteger(seed)) || !input.aggregationRule.trim() || input.rawJudgments.some((judgment) => !judgment.evaluatorId.trim() || !judgment.verdict.trim() || !Number.isFinite(judgment.confidence) || judgment.confidence < 0 || judgment.confidence > 1 || !judgment.evidenceRefs.length)) throw new Error("EVALUATION_RUN_ARCHIVE_INVALID");
  const usage = input.usage;
  if (![usage.inputTokens, usage.outputTokens, usage.costCents, usage.latencyMs].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("EVALUATION_RUN_USAGE_INVALID");
  if (input.reproducibility === "limited" && !input.limitationReason?.trim()) throw new Error("EVALUATION_RUN_LIMITATION_REQUIRED");
  if (input.evaluationScope === "platform-regression" && !input.accessGrantId?.trim()) throw new Error("EVALUATION_RUN_ACCESS_GRANT_REQUIRED");
  const base = { schemaVersion: "evaluation-run-archive.v1" as const, ...input, caseRefs: [...input.caseRefs], candidateRefs: [...input.candidateRefs], seeds: [...input.seeds], rawJudgments: input.rawJudgments.map((judgment) => ({ ...judgment, evidenceRefs: [...judgment.evidenceRefs] })) };
  return { ...base, fingerprint: hash(base) };
}

export function assertEvaluationRunArchiveIntegrity(archive: EvaluationRunArchive, expectedRunId?: string): EvaluationRunArchive {
  const { fingerprint: _fingerprint, ...base } = archive;
  const usage = archive.usage;
  const shapeValid = archive.schemaVersion === "evaluation-run-archive.v1" && (!expectedRunId || archive.runId === expectedRunId) && Boolean(archive.runId?.trim() && archive.suiteFingerprint?.trim() && archive.inputFingerprint?.trim() && archive.modelVersion?.trim() && archive.promptVersion?.trim() && archive.contextFingerprint?.trim() && archive.evaluatorVersion?.trim() && archive.aggregationRule?.trim()) && Array.isArray(archive.caseRefs) && archive.caseRefs.length > 0 && archive.caseRefs.every((ref) => typeof ref === "string" && ref.trim()) && Array.isArray(archive.candidateRefs) && archive.candidateRefs.length > 0 && archive.candidateRefs.every((ref) => typeof ref === "string" && ref.trim()) && Array.isArray(archive.seeds) && archive.seeds.length > 0 && archive.seeds.every((seed) => Number.isInteger(seed)) && Array.isArray(archive.rawJudgments) && archive.rawJudgments.every((judgment) => Boolean(judgment?.evaluatorId?.trim() && judgment.verdict?.trim() && Number.isFinite(judgment.confidence) && judgment.confidence >= 0 && judgment.confidence <= 1 && Array.isArray(judgment.evidenceRefs) && judgment.evidenceRefs.length > 0 && judgment.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim()))) && usage && [usage.inputTokens, usage.outputTokens, usage.costCents, usage.latencyMs].every((value) => Number.isFinite(value) && value >= 0) && ["approved", "blocked", "experimental"].includes(archive.releaseConclusion) && ["replayable", "limited"].includes(archive.reproducibility) && (archive.evaluationScope === undefined || ["project-evaluation", "platform-regression"].includes(archive.evaluationScope)) && (archive.reproducibility !== "limited" || Boolean(archive.limitationReason?.trim())) && (archive.evaluationScope !== "platform-regression" || Boolean(archive.accessGrantId?.trim()));
  if (!shapeValid || !/^[a-f0-9]{64}$/i.test(archive.fingerprint) || hash(base) !== archive.fingerprint) throw new Error("EVALUATION_RUN_ARCHIVE_INTEGRITY_FAILED");
  return archive;
}

function archivePath(root: string, runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error("EVALUATION_RUN_ID_INVALID");
  return resolveInside(root, path.join("evaluations", "runs", `${runId}.json`));
}

export async function readEvaluationRunArchive(root: string, runId: string): Promise<EvaluationRunArchive | null> {
  try {
    const archive = JSON.parse(await fs.readFile(archivePath(root, runId), "utf8")) as EvaluationRunArchive;
    assertEvaluationRunArchiveIntegrity(archive, runId);
    return archive;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistEvaluationRunArchive(root: string, archive: EvaluationRunArchive): Promise<EvaluationRunArchive> {
  assertEvaluationRunArchiveIntegrity(archive);
  const target = archivePath(root, archive.runId);
  const existing = await readEvaluationRunArchive(root, archive.runId);
  if (existing) {
    if (existing.fingerprint === archive.fingerprint) return existing;
    throw new Error("EVALUATION_RUN_ARCHIVE_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return archive;
}
