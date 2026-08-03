import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type EvaluationCaseTrigger = "author-correction" | "adoption-reversal" | "production-regression";
export interface EvaluationCase {
  schemaVersion: "evaluation-case.v1";
  caseId: string;
  trigger: EvaluationCaseTrigger;
  defectCategory: string;
  candidateRef: string;
  inputFingerprint: string;
  expectedGuardRefs: string[];
  replayable: true;
  containsPrivateText: false;
  fixVersion: string;
  fingerprint: string;
}
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createEvaluationCase(input: Omit<EvaluationCase, "schemaVersion" | "replayable" | "containsPrivateText" | "fingerprint">): EvaluationCase {
  if (!input.caseId.trim() || !input.defectCategory.trim() || !input.candidateRef.trim() || !input.inputFingerprint.trim() || !input.fixVersion.trim() || !input.expectedGuardRefs.length || input.expectedGuardRefs.some((ref) => !ref.trim()) || !["author-correction", "adoption-reversal", "production-regression"].includes(input.trigger)) throw new Error("EVALUATION_CASE_FIELDS_INVALID");
  const base = { schemaVersion: "evaluation-case.v1" as const, ...input, expectedGuardRefs: [...input.expectedGuardRefs], replayable: true as const, containsPrivateText: false as const };
  return { ...base, fingerprint: hash(base) };
}

export function assertEvaluationCaseIntegrity(evaluationCase: EvaluationCase, expectedId?: string): EvaluationCase {
  const shapeValid = evaluationCase?.schemaVersion === "evaluation-case.v1" && (!expectedId || evaluationCase.caseId === expectedId) && typeof evaluationCase.caseId === "string" && evaluationCase.caseId.trim() && ["author-correction", "adoption-reversal", "production-regression"].includes(evaluationCase.trigger) && typeof evaluationCase.defectCategory === "string" && evaluationCase.defectCategory.trim() && typeof evaluationCase.candidateRef === "string" && evaluationCase.candidateRef.trim() && typeof evaluationCase.inputFingerprint === "string" && evaluationCase.inputFingerprint.trim() && Array.isArray(evaluationCase.expectedGuardRefs) && evaluationCase.expectedGuardRefs.length > 0 && evaluationCase.expectedGuardRefs.every((ref) => typeof ref === "string" && ref.trim()) && evaluationCase.containsPrivateText === false && evaluationCase.replayable === true && typeof evaluationCase.fixVersion === "string" && evaluationCase.fixVersion.trim();
  if (!shapeValid) throw new Error("EVALUATION_CASE_INTEGRITY_FAILED");
  const { fingerprint: _fingerprint, ...base } = evaluationCase;
  if (!/^[a-f0-9]{64}$/i.test(evaluationCase.fingerprint) || hash(base) !== evaluationCase.fingerprint) throw new Error("EVALUATION_CASE_INTEGRITY_FAILED");
  return evaluationCase;
}

function casePath(root: string, caseId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(caseId)) throw new Error("EVALUATION_CASE_ID_INVALID");
  return resolveInside(root, path.join("evaluations", "cases", `${caseId}.json`));
}

export async function readEvaluationCase(root: string, caseId: string): Promise<EvaluationCase | null> {
  try {
    const value = JSON.parse(await fs.readFile(casePath(root, caseId), "utf8")) as EvaluationCase;
    assertEvaluationCaseIntegrity(value, caseId);
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistEvaluationCase(root: string, evaluationCase: EvaluationCase): Promise<{ created: boolean; evaluationCase: EvaluationCase }> {
  assertEvaluationCaseIntegrity(evaluationCase);
  const target = casePath(root, evaluationCase.caseId);
  const existing = await readEvaluationCase(root, evaluationCase.caseId);
  if (existing) {
    if (existing.fingerprint === evaluationCase.fingerprint) return { created: false, evaluationCase: existing };
    throw new Error("EVALUATION_CASE_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(evaluationCase, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, evaluationCase };
}
