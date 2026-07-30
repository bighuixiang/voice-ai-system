import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { auditNarrativeObligationCoverage } from "./obligationCoverage.js";
import { listNarrativeObligations, readNarrativeObligation, type ObligationEvent, type ObligationStatus } from "./narrativeObligation.js";

const terminalStatuses = new Set<ObligationStatus>(["paid", "neutralized", "transformed", "waived", "opened"]);

export interface ObligationCoverageCertificate {
  schemaVersion: "obligation-coverage-certificate.v1";
  status: "issued";
  sourceFingerprint: string;
  chapterIds: string[];
  plannedIds: string[];
  obligationCount: number;
  terminalObligationIds: string[];
  generatedAt: string;
  fingerprint: string;
}

export interface ObligationCoverageInvalidation {
  schemaVersion: "obligation-coverage-invalidation.v1";
  status: "stale";
  certificateFingerprint: string;
  previousSourceFingerprint: string;
  currentSourceFingerprint: string;
  reason: "source-fingerprint-changed";
  invalidatedAt: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function verifyCertificateFingerprint(certificate: ObligationCoverageCertificate): boolean {
  const { fingerprint, ...base } = certificate;
  return hash(base) === fingerprint;
}

function isUri(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value.trim());
}

async function readEvents(root: string, obligationId: string): Promise<ObligationEvent[]> {
  try {
    const raw = await fs.readFile(resolveInside(root, `sessions/obligations/${obligationId}.events.jsonl`), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ObligationEvent);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function issueObligationCoverageCertificate(root: string, chapterIds: string[], sourceFingerprint: string): Promise<ObligationCoverageCertificate> {
  if (!sourceFingerprint.trim()) throw new Error("OBLIGATION_COVERAGE_SOURCE_FINGERPRINT_REQUIRED");
  const coverage = await auditNarrativeObligationCoverage(root, chapterIds);
  const obligations = await listNarrativeObligations(root);
  if (coverage.sourceCoverageStatus !== "covered" || coverage.orphanPlannedIds.length > 0 || obligations.length === 0) {
    throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
  }
  const terminalObligationIds: string[] = [];
  for (const obligation of obligations) {
    const current = await readNarrativeObligation(root, obligation.obligationId);
    if (!current || !terminalStatuses.has(current.status)) throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
    const events = await readEvents(root, current.obligationId);
    const finalEvent = events.at(-1);
    if (!finalEvent || finalEvent.toStatus !== current.status) throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
    if (current.status === "paid" && (!finalEvent.evidenceRefs.length || finalEvent.evidenceRefs.some((reference) => !isUri(reference)))) {
      throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_BLOCKED");
    }
    terminalObligationIds.push(current.obligationId);
  }
  const base = {
    schemaVersion: "obligation-coverage-certificate.v1" as const,
    status: "issued" as const,
    sourceFingerprint: sourceFingerprint.trim(),
    chapterIds: [...new Set(chapterIds)].sort(),
    plannedIds: coverage.plannedIds,
    obligationCount: obligations.length,
    terminalObligationIds: terminalObligationIds.sort(),
    generatedAt: new Date().toISOString()
  };
  const certificate: ObligationCoverageCertificate = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, "sessions/obligations/coverage-certificate.json");
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return certificate;
}

async function readCertificate(root: string): Promise<ObligationCoverageCertificate | null> {
  try {
    return JSON.parse(await fs.readFile(resolveInside(root, "sessions/obligations/coverage-certificate.json"), "utf8")) as ObligationCoverageCertificate;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function readInvalidation(root: string): Promise<ObligationCoverageInvalidation | null> {
  try {
    return JSON.parse(await fs.readFile(resolveInside(root, "sessions/obligations/coverage-certificate.invalidation.json"), "utf8")) as ObligationCoverageInvalidation;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function assertObligationCoverageCertificateCurrent(root: string, currentSourceFingerprint: string): Promise<{ valid: true; certificate: ObligationCoverageCertificate }> {
  const certificate = await readCertificate(root);
  if (!certificate || !currentSourceFingerprint.trim()) throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_STALE");
  const invalidation = await readInvalidation(root);
  if (invalidation || certificate.sourceFingerprint !== currentSourceFingerprint.trim() || !verifyCertificateFingerprint(certificate)) throw new Error("OBLIGATION_COVERAGE_CERTIFICATE_STALE");
  return { valid: true, certificate };
}

export async function invalidateObligationCoverageCertificate(root: string, currentSourceFingerprint: string): Promise<ObligationCoverageInvalidation | null> {
  const certificate = await readCertificate(root);
  if (!certificate) return null;
  if (!currentSourceFingerprint.trim()) throw new Error("OBLIGATION_COVERAGE_SOURCE_FINGERPRINT_REQUIRED");
  const existing = await readInvalidation(root);
  if (existing && existing.currentSourceFingerprint === currentSourceFingerprint.trim()) return existing;
  if (certificate.sourceFingerprint === currentSourceFingerprint.trim()) return null;
  const invalidation: ObligationCoverageInvalidation = {
    schemaVersion: "obligation-coverage-invalidation.v1",
    status: "stale",
    certificateFingerprint: certificate.fingerprint,
    previousSourceFingerprint: certificate.sourceFingerprint,
    currentSourceFingerprint: currentSourceFingerprint.trim(),
    reason: "source-fingerprint-changed",
    invalidatedAt: new Date().toISOString()
  };
  const target = resolveInside(root, "sessions/obligations/coverage-certificate.invalidation.json");
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(invalidation, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return invalidation;
}
