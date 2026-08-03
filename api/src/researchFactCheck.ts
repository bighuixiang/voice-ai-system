import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ResearchClaim, ResearchSourceSnapshot } from "./researchGrounding.js";
import { resolveInside } from "./pathSafety.js";

export interface ResearchFactCheckResult {
  schemaVersion: "research-fact-check.v1";
  claimId: string;
  claimFingerprint: string;
  status: "supported" | "blocked";
  reasons: string[];
  sourceId: string | null;
  evidenceExcerpt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateResearchFactCheck(input: {
  claim: ResearchClaim;
  source: ResearchSourceSnapshot | null;
  evidenceExcerpt: string;
}): ResearchFactCheckResult {
  const reasons: string[] = [];
  if (!input.source || input.source.sourceId !== input.claim.sourceSnapshotId) reasons.push("SOURCE_SNAPSHOT_MISSING");
  if (!input.evidenceExcerpt.trim()) reasons.push("EVIDENCE_EXCERPT_REQUIRED");
  if (input.source && input.claim.anchor !== `source://${input.source.sourceId}#${input.claim.anchor.split("#")[1] || ""}`) reasons.push("CLAIM_ANCHOR_MISMATCH");
  if (input.source && input.evidenceExcerpt.trim() && !input.source.sanitizedContent.includes(input.evidenceExcerpt.trim())) reasons.push("EVIDENCE_EXCERPT_NOT_IN_SOURCE");
  const base = {
    schemaVersion: "research-fact-check.v1" as const,
    claimId: input.claim.claimId,
    claimFingerprint: input.claim.fingerprint,
    status: reasons.length ? "blocked" as const : "supported" as const,
    reasons,
    sourceId: input.source?.sourceId || null,
    evidenceExcerpt: input.evidenceExcerpt.trim()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertResearchFactCheckIntegrity(result: ResearchFactCheckResult, expectedClaimId?: string): ResearchFactCheckResult {
  const { fingerprint: _fingerprint, ...base } = result;
  const reasonsValid = Array.isArray(result.reasons) && result.reasons.every((reason) => typeof reason === "string" && reason.trim());
  const statusValid = result.status === "supported" ? reasonsValid && result.reasons.length === 0 && typeof result.sourceId === "string" && result.sourceId.trim() : reasonsValid && result.reasons.length > 0;
  if (result.schemaVersion !== "research-fact-check.v1" || (expectedClaimId !== undefined && result.claimId !== expectedClaimId) || !result.claimId.trim() || !/^[a-f0-9]{64}$/i.test(result.claimFingerprint) || !["supported", "blocked"].includes(result.status) || !reasonsValid || (result.sourceId !== null && (typeof result.sourceId !== "string" || !result.sourceId.trim())) || !result.evidenceExcerpt.trim() || !statusValid || !/^[a-f0-9]{64}$/i.test(result.fingerprint) || hash(base) !== result.fingerprint) throw new Error("RESEARCH_FACT_CHECK_INTEGRITY_FAILED");
  return result;
}

function factCheckPath(root: string, claimId: string): string { return resolveInside(root, path.join("research", "fact-checks", `${claimId}.json`)); }
export async function readResearchFactCheck(root: string, claimId: string): Promise<ResearchFactCheckResult | null> {
  try { const result = assertResearchFactCheckIntegrity(JSON.parse(await fs.readFile(factCheckPath(root, claimId), "utf8")) as ResearchFactCheckResult, claimId); return result; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export async function persistResearchFactCheck(root: string, result: ResearchFactCheckResult): Promise<{ created: boolean; factCheck: ResearchFactCheckResult }> {
  assertResearchFactCheckIntegrity(result);
  const target = factCheckPath(root, result.claimId);
  const existing = await readResearchFactCheck(root, result.claimId);
  if (existing) {
    if (existing.fingerprint === result.fingerprint) return { created: false, factCheck: existing };
    throw new Error("RESEARCH_FACT_CHECK_IMMUTABLE");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return { created: true, factCheck: result };
}
