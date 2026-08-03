import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type CandidateFreshnessDisposition = "fresh" | "stale-candidate" | "audit-pending";

export interface CandidateFreshnessReceipt {
  schemaVersion: "candidate-freshness.v1";
  receiptId: string;
  projectSlug: string;
  candidateId: string;
  candidateSourceFingerprint: string;
  currentUpstreamFingerprint: string;
  executionState: "not-started" | "running" | "completed";
  chapterSettled: boolean;
  disposition: CandidateFreshnessDisposition;
  replacementRequired: boolean;
  reason?: "UPSTREAM_VERSION_CHANGED";
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const receiptPath = (root: string, id: string) => resolveInside(root, path.join("sessions", "candidate-freshness", `${id}.json`));

function assertIntegrity(value: CandidateFreshnessReceipt, expectedId?: string): CandidateFreshnessReceipt {
  const { fingerprint, ...base } = value;
  const valid = value?.schemaVersion === "candidate-freshness.v1" && (!expectedId || value.receiptId === expectedId) && [value.receiptId, value.projectSlug, value.candidateId, value.candidateSourceFingerprint, value.currentUpstreamFingerprint, value.createdAt].every((item) => typeof item === "string" && item.trim()) && ["not-started", "running", "completed"].includes(value.executionState) && ["fresh", "stale-candidate", "audit-pending"].includes(value.disposition) && typeof value.chapterSettled === "boolean" && typeof value.replacementRequired === "boolean" && (value.reason === undefined || value.reason === "UPSTREAM_VERSION_CHANGED") && !Number.isNaN(Date.parse(value.createdAt)) && /^[a-f0-9]{64}$/i.test(value.fingerprint) && hash(base) === value.fingerprint;
  if (!valid) throw new Error("CANDIDATE_FRESHNESS_INTEGRITY_FAILED");
  return value;
}

export async function readCandidateFreshness(root: string, receiptId: string): Promise<CandidateFreshnessReceipt | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(receiptPath(root, receiptId), "utf8")) as CandidateFreshnessReceipt, receiptId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export function evaluateCandidateFreshness(input: { projectSlug: string; candidateId: string; candidateSourceFingerprint: string; currentUpstreamFingerprint: string; executionState: CandidateFreshnessReceipt["executionState"]; chapterSettled?: boolean }): Omit<CandidateFreshnessReceipt, "receiptId" | "createdAt" | "fingerprint"> {
  const chapterSettled = input.chapterSettled === true;
  const matches = input.candidateSourceFingerprint === input.currentUpstreamFingerprint;
  const disposition: CandidateFreshnessDisposition = matches ? "fresh" : chapterSettled ? "audit-pending" : "stale-candidate";
  return {
    schemaVersion: "candidate-freshness.v1",
    projectSlug: input.projectSlug,
    candidateId: input.candidateId,
    candidateSourceFingerprint: input.candidateSourceFingerprint,
    currentUpstreamFingerprint: input.currentUpstreamFingerprint,
    executionState: input.executionState,
    chapterSettled,
    disposition,
    replacementRequired: !matches,
    ...(matches ? {} : { reason: "UPSTREAM_VERSION_CHANGED" as const })
  };
}

export async function recordCandidateFreshness(input: Parameters<typeof evaluateCandidateFreshness>[0] & { root: string }): Promise<CandidateFreshnessReceipt> {
  const identity = evaluateCandidateFreshness(input);
  const receiptId = `candidate-freshness-${hash(identity).slice(0, 24)}`;
  const existing = await readCandidateFreshness(input.root, receiptId);
  if (existing) return existing;
  const base = { ...identity, receiptId, createdAt: new Date().toISOString() };
  const receipt = { ...base, fingerprint: hash(base) } as CandidateFreshnessReceipt;
  await fs.mkdir(path.dirname(receiptPath(input.root, receiptId)), { recursive: true });
  await fs.writeFile(receiptPath(input.root, receiptId), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
