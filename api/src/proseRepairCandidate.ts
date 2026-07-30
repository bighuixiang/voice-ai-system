import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { createProseCandidate, type ProseCandidate } from "./proseCandidate.js";
import type { ProseRepairPlan } from "./proseRepairPlan.js";

export interface ProseRepairCandidate {
  schemaVersion: "prose-repair-candidate.v1";
  repairCandidateId: string;
  planId: string;
  parentCandidateId: string;
  parentCandidateFingerprint: string;
  candidateId: string;
  changedParagraphIndexes: number[];
  status: "generated" | "validated" | "rejected";
  createdAt: string;
  fingerprint: string;
}

const metadataPath = (root: string, id: string) => resolveInside(root, `sessions/prose-repair-candidates/${id}.json`);
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function writeJson(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readProseRepairCandidate(root: string, repairCandidateId: string): Promise<ProseRepairCandidate | null> {
  try { return JSON.parse(await fs.readFile(metadataPath(root, repairCandidateId), "utf8")) as ProseRepairCandidate; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createProseRepairCandidate(input: { root: string; plan: ProseRepairPlan; parent: ProseCandidate; content: string }): Promise<{ candidate: ProseCandidate; metadata: ProseRepairCandidate }> {
  if (input.plan.status !== "ready") throw new Error("PROSE_REPAIR_PLAN_NOT_READY");
  if (input.plan.candidateId !== input.parent.candidateId || input.plan.rollbackPoint.candidateFingerprint !== input.parent.fingerprint) throw new Error("PROSE_REPAIR_PARENT_STALE");
  if (!input.content.trim() || input.content === input.parent.content) throw new Error("PROSE_REPAIR_NO_CHANGE");
  const before = input.parent.content.split(/\n\s*\n|\n/);
  const after = input.content.split(/\n\s*\n|\n/);
  const changedParagraphIndexes = Array.from({ length: Math.max(before.length, after.length) }, (_, index) => index).filter((index) => before[index] !== after[index]);
  if (changedParagraphIndexes.length > input.plan.scope.maxChangedParagraphs) throw new Error("PROSE_REPAIR_SCOPE_EXCEEDED");
  const sourceFingerprint = hash({ planId: input.plan.planId, parentFingerprint: input.parent.fingerprint, content: input.content });
  const candidate = await createProseCandidate({ root: input.root, projectSlug: input.parent.projectSlug, chapterId: input.parent.chapterId, content: input.content, outlineVersionId: input.parent.generation.outlineVersionId, executionProofFingerprint: input.parent.generation.executionProofFingerprint, sourceFingerprint });
  const base = { schemaVersion: "prose-repair-candidate.v1" as const, repairCandidateId: `repair-candidate-${candidate.candidateId}`, planId: input.plan.planId, parentCandidateId: input.parent.candidateId, parentCandidateFingerprint: input.parent.fingerprint, candidateId: candidate.candidateId, changedParagraphIndexes, status: "generated" as const, createdAt: new Date().toISOString() };
  const metadata = { ...base, fingerprint: hash(base) };
  await writeJson(metadataPath(input.root, metadata.repairCandidateId), metadata);
  return { candidate, metadata };
}
