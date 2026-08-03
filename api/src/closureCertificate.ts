import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertObligationCoverageCertificateCurrent } from "./obligationCertificate.js";
import { readChapterSettlement } from "./chapterSettlement.js";

export interface ClosureCertificate {
  schemaVersion: "closure-certificate.v1";
  status: "audited_complete";
  projectSlug: string;
  chapterIds: string[];
  settlementIds: string[];
  obligationCoverageFingerprint: string;
  sourceFingerprint: string;
  generatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function certificatePath(root: string): string { return resolveInside(root, "sessions/closure/closure-certificate.json"); }

async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function verifyFingerprint(value: { fingerprint: string }): boolean {
  const { fingerprint, ...base } = value;
  return hash(base) === fingerprint;
}
function verifySemantics(certificate: ClosureCertificate): boolean {
  return certificate.schemaVersion === "closure-certificate.v1" && certificate.status === "audited_complete" && typeof certificate.projectSlug === "string" && certificate.projectSlug.trim().length > 0 && Array.isArray(certificate.chapterIds) && certificate.chapterIds.length > 0 && certificate.chapterIds.every((id) => typeof id === "string" && id.trim().length > 0) && new Set(certificate.chapterIds).size === certificate.chapterIds.length && Array.isArray(certificate.settlementIds) && certificate.settlementIds.length === certificate.chapterIds.length && certificate.settlementIds.every((id) => typeof id === "string" && id.trim().length > 0) && typeof certificate.obligationCoverageFingerprint === "string" && certificate.obligationCoverageFingerprint.trim().length > 0 && typeof certificate.sourceFingerprint === "string" && certificate.sourceFingerprint.trim().length > 0 && typeof certificate.generatedAt === "string" && certificate.generatedAt.trim().length > 0;
}

export async function readClosureCertificate(root: string): Promise<ClosureCertificate | null> {
  const certificate = await readJson<ClosureCertificate>(certificatePath(root));
  if (certificate && !verifyFingerprint(certificate)) throw new Error("CLOSURE_CERTIFICATE_STALE");
  if (certificate && !verifySemantics(certificate)) throw new Error("CLOSURE_CERTIFICATE_SEMANTIC_INVALID");
  return certificate;
}

export async function issueClosureCertificate(root: string, input: { projectSlug: string; chapterIds: string[]; sourceFingerprint: string }): Promise<ClosureCertificate> {
  const sourceFingerprint = input.sourceFingerprint.trim();
  if (!sourceFingerprint) throw new Error("CLOSURE_SOURCE_FINGERPRINT_REQUIRED");
  const chapterIds = [...new Set(input.chapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!chapterIds.length) throw new Error("CLOSURE_CHAPTERS_REQUIRED");
  const existing = await readClosureCertificate(root);
  if (existing) {
    if (!verifyFingerprint(existing)) throw new Error("CLOSURE_CERTIFICATE_STALE");
    if (existing.sourceFingerprint === sourceFingerprint) {
      if (existing.projectSlug !== input.projectSlug || JSON.stringify(existing.chapterIds) !== JSON.stringify(chapterIds)) throw new Error("CLOSURE_CERTIFICATE_CONFLICT");
      const coverage = await assertObligationCoverageCertificateCurrent(root, sourceFingerprint).catch(() => { throw new Error("CLOSURE_CERTIFICATE_STALE"); });
      if (coverage.certificate.fingerprint !== existing.obligationCoverageFingerprint) throw new Error("CLOSURE_CERTIFICATE_STALE");
      for (const [index, chapterId] of existing.chapterIds.entries()) {
        const settlement = await readChapterSettlement(root, existing.settlementIds[index]);
        if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== input.projectSlug || settlement.chapterId !== chapterId) throw new Error("CLOSURE_CHAPTER_SETTLEMENT_REQUIRED");
      }
      return existing;
    }
    throw new Error("CLOSURE_CERTIFICATE_IMMUTABLE");
  }
  const coverage = await assertObligationCoverageCertificateCurrent(root, sourceFingerprint).catch(() => { throw new Error("CLOSURE_OBLIGATION_COVERAGE_REQUIRED"); });
  if (!verifyFingerprint(coverage.certificate)) throw new Error("CLOSURE_OBLIGATION_COVERAGE_INTEGRITY_FAILED");
  const settlementIds: string[] = [];
  for (const chapterId of chapterIds) {
    const settlementDir = resolveInside(root, "sessions/chapter-settlements");
    const names = await fs.readdir(settlementDir).catch(() => [] as string[]);
    let found: Awaited<ReturnType<typeof readChapterSettlement>> = null;
    for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
      const settlement = await readChapterSettlement(root, name.slice(0, -5));
      if (settlement?.chapterId === chapterId) { found = settlement; break; }
    }
    if (!found || found.status !== "settled" || found.projectSlug !== input.projectSlug || !verifyFingerprint(found)) throw new Error("CLOSURE_CHAPTER_SETTLEMENT_REQUIRED");
    settlementIds.push(found.settlementId);
  }
  const base = {
    schemaVersion: "closure-certificate.v1" as const,
    status: "audited_complete" as const,
    projectSlug: input.projectSlug,
    chapterIds,
    settlementIds: settlementIds.sort(),
    obligationCoverageFingerprint: coverage.certificate.fingerprint,
    sourceFingerprint,
    generatedAt: new Date().toISOString()
  };
  const certificate: ClosureCertificate = { ...base, fingerprint: hash(base) };
  const target = certificatePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return certificate;
}

export async function assertClosureCertificateCurrent(root: string, sourceFingerprint: string): Promise<{ valid: true; certificate: ClosureCertificate }> {
  const certificate = await readClosureCertificate(root);
  if (!certificate || certificate.sourceFingerprint !== sourceFingerprint.trim() || !verifyFingerprint(certificate)) throw new Error("CLOSURE_CERTIFICATE_STALE");
  const coverage = await assertObligationCoverageCertificateCurrent(root, sourceFingerprint);
  if (!verifyFingerprint(coverage.certificate)) throw new Error("CLOSURE_CERTIFICATE_STALE");
  if (certificate.obligationCoverageFingerprint !== coverage.certificate.fingerprint) throw new Error("CLOSURE_CERTIFICATE_STALE");
  return { valid: true, certificate };
}
