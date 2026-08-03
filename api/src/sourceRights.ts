import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type RightsStatus = "owned" | "licensed" | "public_domain" | "analysis_only" | "unknown";
export type AllowedUse = "analysis" | "style-experiment" | "generation" | "publication";

export interface SourceMaterialRecord {
  schemaVersion: "source-material-record.v1";
  sourceId: string;
  projectSlug: string;
  title: string;
  type: string;
  provenance: string;
  rightsStatus: RightsStatus;
  licensor: string;
  licenseExpiresAt?: string;
  allowedUses: AllowedUse[];
  projectScope: string;
  retainExcerpt: boolean;
  importedBy: string;
  createdAt: string;
  fingerprint: string;
}

export interface RightsEnvelope {
  schemaVersion: "rights-envelope.v1";
  envelopeId: string;
  sourceId: string;
  projectSlug: string;
  rightsStatus: RightsStatus;
  allowedUses: AllowedUse[];
  analysisOnly: boolean;
  status: "valid" | "restricted" | "expired" | "unknown";
  checkedBy: string;
  checkedAt: string;
  sourceFingerprint: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sourcePath(root: string, sourceId: string): string { return resolveInside(root, `sessions/source-material/${sourceId}.json`); }
function envelopePath(root: string, envelopeId: string): string { return resolveInside(root, `sessions/rights-envelopes/${envelopeId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

function assertSourceIntegrity(source: SourceMaterialRecord, expectedId?: string): SourceMaterialRecord { const { fingerprint: _fingerprint, ...base } = source; const uses: AllowedUse[] = ["analysis", "style-experiment", "generation", "publication"]; const licensorValid = source.rightsStatus === "unknown" || source.rightsStatus === "analysis_only" ? typeof source.licensor === "string" : typeof source.licensor === "string" && source.licensor.trim().length > 0; const valid = source.schemaVersion === "source-material-record.v1" && (!expectedId || source.sourceId === expectedId) && [source.sourceId, source.projectSlug, source.title, source.type, source.provenance, source.projectScope, source.importedBy, source.createdAt].every((value) => typeof value === "string" && value.trim()) && licensorValid && ["owned", "licensed", "public_domain", "analysis_only", "unknown"].includes(source.rightsStatus) && Array.isArray(source.allowedUses) && source.allowedUses.length > 0 && source.allowedUses.every((use) => uses.includes(use)) && new Set(source.allowedUses).size === source.allowedUses.length && typeof source.retainExcerpt === "boolean" && (source.licenseExpiresAt === undefined || Number.isFinite(Date.parse(source.licenseExpiresAt))) && Number.isFinite(Date.parse(source.createdAt)) && /^[a-f0-9]{64}$/i.test(source.fingerprint) && hash(base) === source.fingerprint; if (!valid) throw new Error("SOURCE_RIGHTS_INTEGRITY_FAILED"); return source; }
function assertEnvelopeIntegrity(envelope: RightsEnvelope, expectedId?: string): RightsEnvelope { const { fingerprint: _fingerprint, ...base } = envelope; const uses: AllowedUse[] = ["analysis", "style-experiment", "generation", "publication"]; const analysisOnlyExpected = envelope.status !== "valid" || !envelope.allowedUses.some((use) => use === "generation" || use === "style-experiment"); const valid = envelope.schemaVersion === "rights-envelope.v1" && (!expectedId || envelope.envelopeId === expectedId) && [envelope.envelopeId, envelope.sourceId, envelope.projectSlug, envelope.checkedBy, envelope.checkedAt].every((value) => typeof value === "string" && value.trim()) && ["owned", "licensed", "public_domain", "analysis_only", "unknown"].includes(envelope.rightsStatus) && Array.isArray(envelope.allowedUses) && envelope.allowedUses.length > 0 && envelope.allowedUses.every((use) => uses.includes(use)) && new Set(envelope.allowedUses).size === envelope.allowedUses.length && ["valid", "restricted", "expired", "unknown"].includes(envelope.status) && typeof envelope.analysisOnly === "boolean" && envelope.analysisOnly === analysisOnlyExpected && Number.isFinite(Date.parse(envelope.checkedAt)) && /^[a-f0-9]{64}$/i.test(envelope.sourceFingerprint) && /^[a-f0-9]{64}$/i.test(envelope.fingerprint) && hash(base) === envelope.fingerprint; if (!valid) throw new Error("RIGHTS_ENVELOPE_INTEGRITY_FAILED"); return envelope; }
export async function readSourceMaterial(root: string, sourceId: string): Promise<SourceMaterialRecord | null> { const source = await readJson<SourceMaterialRecord>(sourcePath(root, sourceId)); return source ? assertSourceIntegrity(source, sourceId) : null; }
export async function readRightsEnvelope(root: string, envelopeId: string): Promise<RightsEnvelope | null> { const envelope = await readJson<RightsEnvelope>(envelopePath(root, envelopeId)); return envelope ? assertEnvelopeIntegrity(envelope, envelopeId) : null; }

export async function createSourceMaterial(input: { root: string; projectSlug: string; title: string; type: string; provenance: string; rightsStatus: RightsStatus; licensor: string; licenseExpiresAt?: string; allowedUses: readonly AllowedUse[]; projectScope: string; retainExcerpt: boolean; importedBy: string }): Promise<SourceMaterialRecord> {
  if (!input.title.trim() || !input.provenance.trim() || !input.projectScope.trim() || !input.importedBy.trim()) throw new Error("SOURCE_MATERIAL_METADATA_REQUIRED");
  const uses: AllowedUse[] = ["analysis", "style-experiment", "generation", "publication"];
  if (!input.allowedUses.length || input.allowedUses.some((use) => !uses.includes(use))) throw new Error("SOURCE_ALLOWED_USE_INVALID");
  if (input.licenseExpiresAt !== undefined && !Number.isFinite(Date.parse(input.licenseExpiresAt))) throw new Error("SOURCE_LICENSE_DATE_INVALID");
  const sourceId = `source-${input.projectSlug}-${hash({ title: input.title, provenance: input.provenance, importedBy: input.importedBy }).slice(0, 16)}`;
  const existing = await readSourceMaterial(input.root, sourceId);
  if (existing) return existing;
  const base = { schemaVersion: "source-material-record.v1" as const, sourceId, projectSlug: input.projectSlug, title: input.title, type: input.type, provenance: input.provenance, rightsStatus: input.rightsStatus, licensor: input.licensor, licenseExpiresAt: input.licenseExpiresAt, allowedUses: [...input.allowedUses], projectScope: input.projectScope, retainExcerpt: input.retainExcerpt, importedBy: input.importedBy, createdAt: new Date().toISOString() };
  const source: SourceMaterialRecord = { ...base, fingerprint: hash(base) };
  await writeJson(sourcePath(input.root, sourceId), source);
  return source;
}

export async function createRightsEnvelope(input: { root: string; source: SourceMaterialRecord; checkedBy: string }): Promise<RightsEnvelope> {
  if (!input.checkedBy.trim()) throw new Error("RIGHTS_CHECKER_REQUIRED");
  const expired = Boolean(input.source.licenseExpiresAt && Date.parse(input.source.licenseExpiresAt) < Date.now());
  const restricted = input.source.rightsStatus === "unknown" || input.source.rightsStatus === "analysis_only";
  const status: RightsEnvelope["status"] = expired ? "expired" : restricted ? "restricted" : "valid";
  const allowedUses: AllowedUse[] = status === "valid" ? input.source.allowedUses.filter((use) => use !== "publication" || input.source.rightsStatus !== "licensed") : ["analysis"];
  const base = { schemaVersion: "rights-envelope.v1" as const, envelopeId: `rights-${input.source.sourceId}-${input.source.fingerprint.slice(0, 16)}`, sourceId: input.source.sourceId, projectSlug: input.source.projectSlug, rightsStatus: input.source.rightsStatus, allowedUses, analysisOnly: status !== "valid" || !allowedUses.includes("generation"), status, checkedBy: input.checkedBy, checkedAt: new Date().toISOString(), sourceFingerprint: input.source.fingerprint };
  const envelope: RightsEnvelope = { ...base, analysisOnly: status !== "valid" || !allowedUses.some((use) => use === "generation" || use === "style-experiment"), fingerprint: hash({ ...base, analysisOnly: status !== "valid" || !allowedUses.some((use) => use === "generation" || use === "style-experiment") }) };
  const existing = await readRightsEnvelope(input.root, envelope.envelopeId);
  if (existing) return existing;
  await writeJson(envelopePath(input.root, envelope.envelopeId), envelope);
  return envelope;
}
