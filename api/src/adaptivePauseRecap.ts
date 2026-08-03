import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type AdaptivePauseRecapTrigger = "volume-boundary" | "ten-settled-chapters" | "major-closure" | "material-risk-change";

export interface AdaptivePauseRecap {
  schemaVersion: "adaptive-pause-recap.v1";
  recapId: string;
  projectSlug: string;
  trigger: AdaptivePauseRecapTrigger;
  settledChapterCount: number;
  settledSummary: string;
  changedSummary: string;
  openRisks: string[];
  qualityEvidence: string[];
  costEvidence: string[];
  paceEvidence: string[];
  nextAuthorizedScope: string;
  continuationSafeReason: string;
  continuationRequiresExistingGrant: true;
  authorResponse: "not-required";
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const recapPath = (root: string, recapId: string): string => resolveInside(root, `sessions/pause-policy/recaps/${recapId}.json`);

function validateRecapSemantics(recap: AdaptivePauseRecap, recapId?: string): boolean {
  return recap.schemaVersion === "adaptive-pause-recap.v1" && (!recapId || recap.recapId === recapId) && Boolean(recap.recapId.trim()) && Boolean(recap.projectSlug.trim()) && ["volume-boundary", "ten-settled-chapters", "major-closure", "material-risk-change"].includes(recap.trigger) && Number.isInteger(recap.settledChapterCount) && recap.settledChapterCount >= 0 && [recap.settledSummary, recap.changedSummary, recap.nextAuthorizedScope, recap.continuationSafeReason].every((value) => value.trim().length > 0) && [recap.openRisks, recap.qualityEvidence, recap.costEvidence, recap.paceEvidence].every((values) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim().length > 0)) && recap.continuationRequiresExistingGrant === true && recap.authorResponse === "not-required" && typeof recap.createdAt === "string" && recap.createdAt.trim().length > 0;
}

export function createAdaptivePauseRecap(input: Omit<AdaptivePauseRecap, "schemaVersion" | "continuationRequiresExistingGrant" | "authorResponse" | "createdAt" | "fingerprint"> & { createdAt?: string }): AdaptivePauseRecap {
  if (!input.recapId.trim() || !input.projectSlug.trim()) throw new Error("ADAPTIVE_PAUSE_RECAP_ID_REQUIRED");
  const base = {
    schemaVersion: "adaptive-pause-recap.v1" as const,
    recapId: input.recapId.trim(),
    projectSlug: input.projectSlug.trim(),
    trigger: input.trigger,
    settledChapterCount: input.settledChapterCount,
    settledSummary: input.settledSummary.trim(),
    changedSummary: input.changedSummary.trim(),
    openRisks: [...input.openRisks],
    qualityEvidence: [...input.qualityEvidence],
    costEvidence: [...input.costEvidence],
    paceEvidence: [...input.paceEvidence],
    nextAuthorizedScope: input.nextAuthorizedScope.trim(),
    continuationSafeReason: input.continuationSafeReason.trim(),
    continuationRequiresExistingGrant: true as const,
    authorResponse: "not-required" as const,
    createdAt: input.createdAt || new Date().toISOString()
  };
  if (!validateRecapSemantics(base as AdaptivePauseRecap)) throw new Error("ADAPTIVE_PAUSE_RECAP_FIELDS_INVALID");
  return { ...base, fingerprint: hash(base) };
}

export function assertAdaptivePauseRecapIntegrity(recap: AdaptivePauseRecap, recapId?: string): AdaptivePauseRecap {
  const { fingerprint, ...base } = recap;
  if ((recapId !== undefined && recap.recapId !== recapId) || !validateRecapSemantics(recap, recapId) || !/^[a-f0-9]{64}$/i.test(recap.fingerprint || "") || hash(base) !== fingerprint) throw new Error("ADAPTIVE_PAUSE_RECAP_INTEGRITY_FAILED");
  return recap;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function persistAdaptivePauseRecap(root: string, recap: AdaptivePauseRecap): Promise<AdaptivePauseRecap> {
  assertAdaptivePauseRecapIntegrity(recap, recap.recapId);
  const existing = await readAdaptivePauseRecap(root, recap.recapId);
  if (existing) return existing;
  await writeJson(recapPath(root, recap.recapId), recap);
  return recap;
}

export async function readAdaptivePauseRecap(root: string, recapId: string): Promise<AdaptivePauseRecap | null> {
  try {
    const recap = JSON.parse(await fs.readFile(recapPath(root, recapId), "utf8")) as AdaptivePauseRecap;
    return assertAdaptivePauseRecapIntegrity(recap, recapId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
