import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertObligationCoverageCertificateCurrent } from "./obligationCertificate.js";

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
function settlementPath(root: string, settlementId: string): string { return resolveInside(root, `sessions/chapter-settlements/${settlementId}.json`); }

async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function verifyFingerprint(value: { fingerprint: string }): boolean {
  const { fingerprint, ...base } = value;
  return hash(base) === fingerprint;
}

export async function readClosureCertificate(root: string): Promise<ClosureCertificate | null> {
  const certificate = await readJson<ClosureCertificate>(certificatePath(root));
  if (certificate && !verifyFingerprint(certificate)) throw new Error("CLOSURE_CERTIFICATE_STALE");
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
    if (existing.sourceFingerprint === sourceFingerprint) return existing;
    throw new Error("CLOSURE_CERTIFICATE_IMMUTABLE");
  }
  const coverage = await assertObligationCoverageCertificateCurrent(root, sourceFingerprint).catch(() => { throw new Error("CLOSURE_OBLIGATION_COVERAGE_REQUIRED"); });
  if (!verifyFingerprint(coverage.certificate)) throw new Error("CLOSURE_OBLIGATION_COVERAGE_INTEGRITY_FAILED");
  const settlementIds: string[] = [];
  for (const chapterId of chapterIds) {
    const settlementDir = resolveInside(root, "sessions/chapter-settlements");
    const names = await fs.readdir(settlementDir).catch(() => [] as string[]);
    let found: { settlementId: string; chapterId?: string; projectSlug?: string; status?: string; fingerprint: string } | null = null;
    for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
      const settlement = await readJson<{ settlementId: string; chapterId?: string; projectSlug?: string; status?: string; fingerprint: string }>(path.join(settlementDir, name));
      if (settlement?.chapterId === chapterId) { found = settlement; break; }
    }
    if (!found || found.status !== "settled" || found.projectSlug !== input.projectSlug || !verifyFingerprint(found)) throw new Error("CLOSURE_CHAPTER_SETTLEMENT_REQUIRED");
    settlementIds.push(found.settlementId);
    if (!(await readJson(settlementPath(root, found.settlementId)))) throw new Error("CLOSURE_CHAPTER_SETTLEMENT_REQUIRED");
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
  return { valid: true, certificate };
}
