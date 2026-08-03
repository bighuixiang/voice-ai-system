import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CandidateComparison } from "./candidateComparison.js";

export interface PersistedCandidateComparison {
  schemaVersion: "candidate-comparison-record.v1";
  comparisonId: string;
  projectSlug: string;
  comparison: CandidateComparison;
  fingerprint: string;
}

const recordPath = (root: string, comparisonId: string) => path.join(root, "sessions", "candidate-comparisons", `${comparisonId}.json`);
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertIntegrity(value: PersistedCandidateComparison, expectedId?: string): PersistedCandidateComparison {
  const { fingerprint: _fingerprint, ...base } = value;
  const valid = value.schemaVersion === "candidate-comparison-record.v1" && (!expectedId || value.comparisonId === expectedId) && value.projectSlug.trim() && /^[a-f0-9]{64}$/i.test(value.comparisonId) && value.comparison?.schemaVersion === "candidate-comparison.v1" && /^[a-f0-9]{64}$/i.test(value.comparison.fingerprint) && /^[a-f0-9]{64}$/i.test(value.fingerprint) && hash(base) === value.fingerprint;
  if (!valid) throw new Error("CANDIDATE_COMPARISON_RECORD_INTEGRITY_FAILED");
  return value;
}

export async function readCandidateComparison(root: string, comparisonId: string, projectSlug?: string): Promise<PersistedCandidateComparison | null> {
  try {
    const value = assertIntegrity(JSON.parse(await fs.readFile(recordPath(root, comparisonId), "utf8")) as PersistedCandidateComparison, comparisonId);
    return projectSlug !== undefined && value.projectSlug !== projectSlug ? null : value;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistCandidateComparison(root: string, projectSlug: string, comparison: CandidateComparison): Promise<PersistedCandidateComparison> {
  if (!projectSlug.trim()) throw new Error("CANDIDATE_COMPARISON_PROJECT_REQUIRED");
  const comparisonId = comparison.fingerprint;
  const existing = await readCandidateComparison(root, comparisonId, projectSlug);
  if (existing) return existing;
  const base = { schemaVersion: "candidate-comparison-record.v1" as const, comparisonId, projectSlug, comparison };
  const record: PersistedCandidateComparison = { ...base, fingerprint: hash(base) };
  assertIntegrity(record, comparisonId);
  const target = recordPath(root, comparisonId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return record;
}
