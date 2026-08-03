import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertEvidenceAnchoredEvaluationIntegrity, type EvidenceAnchoredEvaluation } from "./evidenceAnchoredEvaluation.js";
import { resolveInside } from "./pathSafety.js";

function evaluationPath(root: string, evaluationId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(evaluationId)) throw new Error("EVALUATION_ID_INVALID");
  return resolveInside(root, path.join("evaluations", "evidence-anchors", `${evaluationId}.json`));
}

export async function readEvidenceAnchoredEvaluation(root: string, evaluationId: string): Promise<EvidenceAnchoredEvaluation | null> {
  try {
    const evaluation = JSON.parse(await fs.readFile(evaluationPath(root, evaluationId), "utf8")) as EvidenceAnchoredEvaluation;
    assertEvidenceAnchoredEvaluationIntegrity(evaluation, evaluationId);
    return evaluation;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistEvidenceAnchoredEvaluation(root: string, evaluation: EvidenceAnchoredEvaluation): Promise<{ created: boolean; evaluation: EvidenceAnchoredEvaluation }> {
  assertEvidenceAnchoredEvaluationIntegrity(evaluation);
  const target = evaluationPath(root, evaluation.evaluationId);
  const existing = await readEvidenceAnchoredEvaluation(root, evaluation.evaluationId);
  if (existing) {
    if (existing.fingerprint === evaluation.fingerprint) return { created: false, evaluation: existing };
    throw new Error("EVALUATION_EVIDENCE_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, evaluation };
}
