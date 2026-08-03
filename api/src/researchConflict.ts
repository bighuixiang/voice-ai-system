import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type ResearchConflictStatus = "open" | "resolved" | "waived";

export interface ResearchConflictCase {
  schemaVersion: "research-conflict-case.v1";
  conflictId: string;
  claimIds: string[];
  sourceIds: string[];
  conflictKind: "direct" | "temporal" | "regional" | "methodological";
  status: ResearchConflictStatus;
  selectedClaimId?: string;
  rationale?: string;
  evidenceRefs: string[];
  createdAt: string;
  resolvedAt?: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const evidenceRef = (value: string): boolean => /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value.trim());
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
export function assertResearchConflictIntegrity(conflict: ResearchConflictCase, expectedId?: string): ResearchConflictCase {
  const { fingerprint, ...base } = conflict;
  const idsValid = Array.isArray(conflict.claimIds) && conflict.claimIds.length >= 2 && conflict.claimIds.every(nonEmpty) && new Set(conflict.claimIds).size === conflict.claimIds.length && Array.isArray(conflict.sourceIds) && conflict.sourceIds.length >= 2 && conflict.sourceIds.every(nonEmpty) && new Set(conflict.sourceIds).size === conflict.sourceIds.length;
  const stateValid = conflict.status === "open" ? conflict.selectedClaimId === undefined && conflict.rationale === undefined && conflict.resolvedAt === undefined : nonEmpty(conflict.rationale) && nonEmpty(conflict.resolvedAt) && Number.isFinite(Date.parse(conflict.resolvedAt)) && (conflict.status === "waived" ? conflict.selectedClaimId === undefined : nonEmpty(conflict.selectedClaimId) && conflict.claimIds.includes(conflict.selectedClaimId));
  const valid = conflict.schemaVersion === "research-conflict-case.v1" && (!expectedId || conflict.conflictId === expectedId) && nonEmpty(conflict.conflictId) && idsValid && ["direct", "temporal", "regional", "methodological"].includes(conflict.conflictKind) && ["open", "resolved", "waived"].includes(conflict.status) && Array.isArray(conflict.evidenceRefs) && conflict.evidenceRefs.length > 0 && conflict.evidenceRefs.every(evidenceRef) && stateValid && nonEmpty(conflict.createdAt) && Number.isFinite(Date.parse(conflict.createdAt)) && /^[a-f0-9]{64}$/i.test(conflict.fingerprint) && hash(base) === conflict.fingerprint;
  if (!valid) throw new Error("RESEARCH_CONFLICT_INTEGRITY_FAILED");
  return conflict;
}

export function createResearchConflictCase(input: {
  conflictId: string;
  claimIds: string[];
  sourceIds: string[];
  conflictKind: ResearchConflictCase["conflictKind"];
  evidenceRefs: string[];
  createdAt?: string;
}): ResearchConflictCase {
  if (!input.conflictId.trim() || input.claimIds.length < 2 || input.sourceIds.length < 2) throw new Error("RESEARCH_CONFLICT_PARTIES_REQUIRED");
  if (new Set(input.claimIds).size !== input.claimIds.length || new Set(input.sourceIds).size !== input.sourceIds.length) throw new Error("RESEARCH_CONFLICT_PARTIES_DUPLICATE");
  if (!input.evidenceRefs.length || input.evidenceRefs.some((ref) => !evidenceRef(ref))) throw new Error("RESEARCH_CONFLICT_EVIDENCE_REQUIRED");
  const base = {
    schemaVersion: "research-conflict-case.v1" as const,
    conflictId: input.conflictId.trim(),
    claimIds: [...input.claimIds],
    sourceIds: [...input.sourceIds],
    conflictKind: input.conflictKind,
    status: "open" as const,
    evidenceRefs: [...input.evidenceRefs],
    createdAt: input.createdAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function resolveResearchConflictCase(input: ResearchConflictCase, resolution: {
  status: Exclude<ResearchConflictStatus, "open">;
  selectedClaimId?: string;
  rationale: string;
  evidenceRefs: string[];
  resolvedAt?: string;
}): ResearchConflictCase {
  if (input.status !== "open") throw new Error("RESEARCH_CONFLICT_NOT_OPEN");
  if (!resolution.rationale.trim() || !resolution.evidenceRefs.length || resolution.evidenceRefs.some((ref) => !evidenceRef(ref))) throw new Error("RESEARCH_CONFLICT_RESOLUTION_EVIDENCE_REQUIRED");
  if (resolution.status === "resolved" && (!resolution.selectedClaimId || !input.claimIds.includes(resolution.selectedClaimId))) throw new Error("RESEARCH_CONFLICT_SELECTED_CLAIM_REQUIRED");
  if (resolution.status === "waived" && resolution.selectedClaimId) throw new Error("RESEARCH_CONFLICT_WAIVER_SELECTION_INVALID");
  const { fingerprint: _oldFingerprint, ...conflictWithoutFingerprint } = input;
  const base = {
    ...conflictWithoutFingerprint,
    status: resolution.status,
    ...(resolution.selectedClaimId ? { selectedClaimId: resolution.selectedClaimId } : {}),
    rationale: resolution.rationale.trim(),
    evidenceRefs: [...input.evidenceRefs, ...resolution.evidenceRefs],
    resolvedAt: resolution.resolvedAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

function conflictPath(root: string, conflictId: string): string {
  return resolveInside(root, `research/conflicts/${conflictId}.json`);
}

export async function persistResearchConflictCase(root: string, conflict: ResearchConflictCase): Promise<{ created: boolean; conflict: ResearchConflictCase }> {
  assertResearchConflictIntegrity(conflict);
  const target = conflictPath(root, conflict.conflictId);
  try {
    const existing = assertResearchConflictIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchConflictCase, conflict.conflictId);
    if (existing.fingerprint !== conflict.fingerprint) throw new Error("RESEARCH_CONFLICT_IMMUTABLE");
    return { created: false, conflict: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(conflict, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, conflict };
}

export async function readResearchConflictCase(root: string, conflictId: string): Promise<ResearchConflictCase | null> {
  try { return assertResearchConflictIntegrity(JSON.parse(await fs.readFile(conflictPath(root, conflictId), "utf8")) as ResearchConflictCase, conflictId); }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistResearchConflictResolution(root: string, conflict: ResearchConflictCase): Promise<{ created: boolean; conflict: ResearchConflictCase }> {
  if (conflict.status === "open") throw new Error("RESEARCH_CONFLICT_RESOLUTION_REQUIRED");
  const target = resolveInside(root, `research/conflicts/${conflict.conflictId}.${conflict.fingerprint}.resolution.json`);
  try {
    const existing = JSON.parse(await fs.readFile(target, "utf8")) as ResearchConflictCase;
    if (existing.fingerprint !== conflict.fingerprint) throw new Error("RESEARCH_CONFLICT_RESOLUTION_IMMUTABLE");
    return { created: false, conflict: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(conflict, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, conflict };
}
