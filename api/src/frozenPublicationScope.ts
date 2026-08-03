import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface FrozenPublicationScope {
  schemaVersion: "frozen-publication-scope.v1";
  scopeId: string;
  projectSlug: string;
  version: number;
  status: "frozen";
  chapterIds: string[];
  scopeFingerprint: string;
  evidence: FrozenPublicationScopeEvidence;
  createdAt: string;
  fingerprint: string;
}

export interface FrozenPublicationScopeEvidenceBinding {
  status: "bound" | "unbound";
  ref: string;
  fingerprint?: string;
  reason?: "ARTIFACT_NOT_FOUND" | "ARTIFACT_NOT_ACCEPTED" | "FINGERPRINT_MISSING";
}

export interface FrozenPublicationScopeEvidence {
  storyContract: FrozenPublicationScopeEvidenceBinding;
  outlineVersion: FrozenPublicationScopeEvidenceBinding;
  obligationCoverage: FrozenPublicationScopeEvidenceBinding;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function scopePath(root: string, scopeId: string): string { return resolveInside(root, `sessions/publication-scopes/${scopeId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

export async function readFrozenPublicationScope(root: string, scopeId: string): Promise<FrozenPublicationScope | null> {
  try {
    const scope = JSON.parse(await fs.readFile(scopePath(root, scopeId), "utf8")) as FrozenPublicationScope;
    const { fingerprint: _fingerprint, ...base } = scope;
    const validBinding = (binding: FrozenPublicationScopeEvidenceBinding | undefined) => Boolean(binding && (binding.status === "bound" || binding.status === "unbound") && typeof binding.ref === "string" && binding.ref.trim() && (binding.status === "unbound" || (typeof binding.fingerprint === "string" && /^[a-f0-9]{64}$/i.test(binding.fingerprint))));
    if (scope.schemaVersion !== "frozen-publication-scope.v1" || scope.scopeId !== scopeId || scope.projectSlug.trim() === "" || scope.version !== 1 || scope.status !== "frozen" || !Array.isArray(scope.chapterIds) || !scope.chapterIds.length || !/^[a-f0-9]{64}$/i.test(scope.scopeFingerprint) || !scope.evidence || !validBinding(scope.evidence.storyContract) || !validBinding(scope.evidence.outlineVersion) || !validBinding(scope.evidence.obligationCoverage) || !/^[a-f0-9]{64}$/i.test(scope.fingerprint) || hash(base) !== scope.fingerprint) throw new Error("FROZEN_PUBLICATION_SCOPE_INTEGRITY_FAILED");
    return scope;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createFrozenPublicationScope(input: { root: string; projectSlug: string; chapterIds: string[]; scopeFingerprint: string; evidence?: Partial<FrozenPublicationScopeEvidence> }): Promise<FrozenPublicationScope> {
  const chapterIds = [...new Set(input.chapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!input.projectSlug.trim() || !chapterIds.length || !/^[a-f0-9]{64}$/i.test(input.scopeFingerprint)) throw new Error("FROZEN_PUBLICATION_SCOPE_INPUT_INVALID");
  const evidence: FrozenPublicationScopeEvidence = {
    storyContract: input.evidence?.storyContract || { status: "unbound", ref: "story-contract:unbound", reason: "ARTIFACT_NOT_FOUND" },
    outlineVersion: input.evidence?.outlineVersion || { status: "unbound", ref: "outline-version:unbound", reason: "ARTIFACT_NOT_FOUND" },
    obligationCoverage: input.evidence?.obligationCoverage || { status: "unbound", ref: "obligation-coverage:unbound", reason: "ARTIFACT_NOT_FOUND" }
  };
  const identity = { projectSlug: input.projectSlug.trim(), version: 1, chapterIds, scopeFingerprint: input.scopeFingerprint, evidence };
  const scopeId = `scope-${hash(identity).slice(0, 24)}`;
  const existing = await readFrozenPublicationScope(input.root, scopeId);
  if (existing) return existing;
  const base = { schemaVersion: "frozen-publication-scope.v1" as const, scopeId, ...identity, status: "frozen" as const, createdAt: new Date().toISOString() };
  const scope: FrozenPublicationScope = { ...base, fingerprint: hash(base) };
  await writeJson(scopePath(input.root, scopeId), scope);
  return scope;
}
