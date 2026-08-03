import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertEvaluationDisagreementIntegrity, type EvaluationDisagreementDecision } from "./evaluationDisagreement.js";
import { resolveInside } from "./pathSafety.js";

export interface PersistedEvaluationDisagreement {
  schemaVersion: "persisted-evaluation-disagreement.v1";
  disagreementId: string;
  projectSlug: string;
  decision: EvaluationDisagreementDecision;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function disagreementPath(root: string, disagreementId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(disagreementId)) throw new Error("EVALUATION_DISAGREEMENT_ID_INVALID");
  return resolveInside(root, path.join("evaluations", "disagreements", `${disagreementId}.json`));
}
function assertPersisted(value: PersistedEvaluationDisagreement, disagreementId: string): PersistedEvaluationDisagreement {
  const { fingerprint: _fingerprint, ...base } = value;
  assertEvaluationDisagreementIntegrity(value.decision);
  if (value.schemaVersion !== "persisted-evaluation-disagreement.v1" || value.disagreementId !== disagreementId || typeof value.projectSlug !== "string" || !value.projectSlug.trim() || typeof value.createdAt !== "string" || !value.createdAt.trim() || Number.isNaN(Date.parse(value.createdAt)) || !/^[a-f0-9]{64}$/i.test(value.fingerprint) || hash(base) !== value.fingerprint) throw new Error("EVALUATION_DISAGREEMENT_STORE_INTEGRITY_FAILED");
  return value;
}

export async function readPersistedEvaluationDisagreement(root: string, disagreementId: string): Promise<PersistedEvaluationDisagreement | null> {
  try { return assertPersisted(JSON.parse(await fs.readFile(disagreementPath(root, disagreementId), "utf8")) as PersistedEvaluationDisagreement, disagreementId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistEvaluationDisagreement(root: string, input: { disagreementId: string; projectSlug: string; decision: EvaluationDisagreementDecision }): Promise<{ created: boolean; record: PersistedEvaluationDisagreement }> {
  assertEvaluationDisagreementIntegrity(input.decision);
  if (!input.projectSlug.trim()) throw new Error("EVALUATION_DISAGREEMENT_PROJECT_REQUIRED");
  const target = disagreementPath(root, input.disagreementId);
  const existing = await readPersistedEvaluationDisagreement(root, input.disagreementId);
  if (existing) {
    if (existing.projectSlug === input.projectSlug && existing.decision.fingerprint === input.decision.fingerprint) return { created: false, record: existing };
    throw new Error("EVALUATION_DISAGREEMENT_IMMUTABLE");
  }
  const base = { schemaVersion: "persisted-evaluation-disagreement.v1" as const, disagreementId: input.disagreementId, projectSlug: input.projectSlug.trim(), decision: input.decision, createdAt: new Date().toISOString() };
  const record = { ...base, fingerprint: hash(base) };
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, record };
}
