import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlement } from "./chapterSettlement.js";
import { readDerivedPublicationTransaction } from "./derivedPublication.js";

export interface ReleaseE2EAcceptance {
  schemaVersion: "release-e2e-acceptance.v1";
  status: "verified";
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  derivedTransactionId: string;
  settlementFingerprint: string;
  derivedFingerprint: string;
  verifiedAt: string;
  fingerprint: string;
}

function proofPath(root: string): string { return resolveInside(root, "sessions/release-e2e-acceptance.json"); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function verifyFingerprint(value: { fingerprint: string }): boolean {
  const { fingerprint, ...base } = value;
  return hash(base) === fingerprint;
}
function assertReleaseProofIntegrity(proof: ReleaseE2EAcceptance): ReleaseE2EAcceptance {
  if (proof.schemaVersion !== "release-e2e-acceptance.v1" || proof.status !== "verified" || !proof.projectSlug.trim() || !proof.chapterId.trim() || !proof.settlementId.trim() || !proof.derivedTransactionId.trim() || !/^[a-f0-9]{64}$/i.test(proof.fingerprint) || !verifyFingerprint(proof)) throw new Error("RELEASE_E2E_PROOF_INTEGRITY_FAILED");
  return proof;
}
function verifyDerivedFingerprint(value: { fingerprint: string; status: string; committedAt?: string; error?: string }): boolean {
  if (verifyFingerprint(value)) return true;
  if (value.status !== "committed" || !value.committedAt) return false;
  const { fingerprint, status, committedAt, error: _error, ...rest } = value;
  const preparedBase = { ...rest, status: "prepared" as const };
  const prepared = { ...preparedBase, fingerprint: hash(preparedBase) };
  const committedBase = { ...prepared, status: "committed" as const, committedAt };
  return hash(committedBase) === fingerprint;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readReleaseE2EAcceptance(root: string): Promise<ReleaseE2EAcceptance | null> {
  try {
    const proof = JSON.parse(await fs.readFile(proofPath(root), "utf8")) as ReleaseE2EAcceptance;
    const verified = assertReleaseProofIntegrity(proof);
    const settlement = await readChapterSettlement(root, verified.settlementId);
    if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== verified.projectSlug || settlement.chapterId !== verified.chapterId || !verifyFingerprint(settlement) || settlement.fingerprint !== verified.settlementFingerprint) throw new Error("RELEASE_E2E_PROOF_STALE");
    const derived = await readDerivedPublicationTransaction(root, verified.derivedTransactionId);
    if (!derived || derived.status !== "committed" || derived.projectSlug !== verified.projectSlug || derived.chapterId !== verified.chapterId || derived.settlementId !== verified.settlementId || !verifyDerivedFingerprint(derived) || derived.fingerprint !== verified.derivedFingerprint) throw new Error("RELEASE_E2E_PROOF_STALE");
    return verified;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function recordReleaseE2EAcceptance(root: string, input: { projectSlug: string; chapterId: string; settlementId: string; derivedTransactionId: string }): Promise<ReleaseE2EAcceptance> {
  const existing = await readReleaseE2EAcceptance(root);
  if (existing) {
    if (!verifyFingerprint(existing)) throw new Error("RELEASE_E2E_PROOF_INTEGRITY_FAILED");
    if (existing.projectSlug !== input.projectSlug || existing.chapterId !== input.chapterId || existing.settlementId !== input.settlementId || existing.derivedTransactionId !== input.derivedTransactionId) {
      throw new Error("RELEASE_E2E_PROOF_CONFLICT");
    }
    return existing;
  }
  let settlement: Awaited<ReturnType<typeof readChapterSettlement>>;
  try {
    settlement = await readChapterSettlement(root, input.settlementId);
  } catch (error) {
    if (error instanceof Error && error.message === "CHAPTER_SETTLEMENT_INTEGRITY_FAILED") throw new Error("RELEASE_E2E_SETTLEMENT_INTEGRITY_FAILED");
    throw error;
  }
  if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== input.projectSlug || settlement.chapterId !== input.chapterId) throw new Error("RELEASE_E2E_SETTLEMENT_REQUIRED");
  if (!verifyFingerprint(settlement)) throw new Error("RELEASE_E2E_SETTLEMENT_INTEGRITY_FAILED");
  const derived = await readDerivedPublicationTransaction(root, input.derivedTransactionId);
  if (!derived || derived.status !== "committed" || derived.projectSlug !== input.projectSlug || derived.chapterId !== input.chapterId || derived.settlementId !== input.settlementId) throw new Error("RELEASE_E2E_DERIVED_PUBLICATION_REQUIRED");
  if (!verifyDerivedFingerprint(derived)) throw new Error("RELEASE_E2E_DERIVED_INTEGRITY_FAILED");
  const base = {
    schemaVersion: "release-e2e-acceptance.v1" as const,
    status: "verified" as const,
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    settlementId: input.settlementId,
    derivedTransactionId: input.derivedTransactionId,
    settlementFingerprint: settlement.fingerprint,
    derivedFingerprint: derived.fingerprint,
    verifiedAt: new Date().toISOString()
  };
  const proof: ReleaseE2EAcceptance = { ...base, fingerprint: hash(base) };
  await writeJson(proofPath(root), proof);
  return proof;
}
