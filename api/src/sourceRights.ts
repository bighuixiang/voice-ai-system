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

export async function readSourceMaterial(root: string, sourceId: string): Promise<SourceMaterialRecord | null> { return readJson<SourceMaterialRecord>(sourcePath(root, sourceId)); }
export async function readRightsEnvelope(root: string, envelopeId: string): Promise<RightsEnvelope | null> { return readJson<RightsEnvelope>(envelopePath(root, envelopeId)); }

export async function createSourceMaterial(input: { root: string; projectSlug: string; title: string; type: string; provenance: string; rightsStatus: RightsStatus; licensor: string; licenseExpiresAt?: string; allowedUses: readonly AllowedUse[]; projectScope: string; retainExcerpt: boolean; importedBy: string }): Promise<SourceMaterialRecord> {
  if (!input.title.trim() || !input.provenance.trim() || !input.projectScope.trim() || !input.importedBy.trim()) throw new Error("SOURCE_MATERIAL_METADATA_REQUIRED");
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
