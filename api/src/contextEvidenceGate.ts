import crypto from "node:crypto";
import { assertContextManifestIntegrity, type ContextManifest } from "./contextManifest.js";

export interface ContextReplayResult {
  schemaVersion: "context-replay-gate.v1";
  status: "pass" | "block";
  reasons: string[];
  manifestFingerprint: string;
  fingerprint: string;
}

export interface PostCallEvidenceResult {
  schemaVersion: "context-evidence-gate.v1";
  status: "supported" | "conflicted";
  reasons: string[];
  unsupportedSourceRefs: string[];
  fingerprint: string;
}

export interface PostCallEvidenceClaim {
  claimId: string;
  text: string;
  contractRefs: string[];
  chapterIntentRefs: string[];
  keyFactRefs: string[];
  evidenceRefs: string[];
  scope: "supported" | "inferred";
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateContextReplay(input: {
  manifest: ContextManifest;
  expectedManifestId: string;
  expectedSourceFingerprint: string;
  expectedSchemaVersion: ContextManifest["schemaVersion"];
  route: string;
  deterministic: { temperature: number; seed: number; topP: number };
}): ContextReplayResult {
  assertContextManifestIntegrity(input.manifest);
  const reasons: string[] = [];
  if (input.manifest.manifestId !== input.expectedManifestId || input.manifest.sourceFingerprint !== input.expectedSourceFingerprint) reasons.push("MANIFEST_STALE");
  if (input.manifest.schemaVersion !== input.expectedSchemaVersion) reasons.push("MANIFEST_SCHEMA_MISMATCH");
  if (!input.route.trim()) reasons.push("ROUTE_REQUIRED");
  if (!Number.isFinite(input.deterministic.temperature) || input.deterministic.temperature !== 0 || !Number.isInteger(input.deterministic.seed) || !Number.isFinite(input.deterministic.topP) || input.deterministic.topP !== 1) reasons.push("DETERMINISTIC_PARAMETERS_REQUIRED");
  if (!Array.isArray(input.manifest.blocks) || !input.manifest.blocks.length || input.manifest.blocks.some((block) => !Array.isArray(block.sourceRefs) || !block.sourceRefs.length || block.finalTokens > block.originalTokens || (!block.selected && !block.exclusionReason?.trim()))) reasons.push("MANIFEST_BLOCK_INCOMPLETE");
  const base = { schemaVersion: "context-replay-gate.v1" as const, status: reasons.length ? "block" as const : "pass" as const, reasons: [...new Set(reasons)], manifestFingerprint: hash(input.manifest) };
  return { ...base, fingerprint: hash(base) };
}

export function evaluatePostCallEvidence(input: {
  manifest: ContextManifest;
  sourceRefs: string[];
  sourceVersions?: Record<string, string>;
  requiredContractRefs?: string[];
  requiredChapterIntentRefs?: string[];
  claims?: PostCallEvidenceClaim[];
}): PostCallEvidenceResult {
  const selected = new Map((Array.isArray(input.manifest.blocks) ? input.manifest.blocks : []).filter((block) => block.selected).flatMap((block) => block.sourceRefs.map((ref) => [ref, block.sourceVersion] as const)));
  const unsupportedSourceRefs = input.sourceRefs.filter((ref) => !selected.has(ref) || (input.sourceVersions?.[ref] !== undefined && input.sourceVersions[ref] !== selected.get(ref)));
  const reasons: string[] = unsupportedSourceRefs.length ? ["EVIDENCE_NOT_SUPPORTED_BY_SELECTED_CONTEXT"] : [];
  const requiredContractRefs = input.requiredContractRefs ?? [];
  const requiredChapterIntentRefs = input.requiredChapterIntentRefs ?? [];
  for (const claim of input.claims ?? []) {
    if (!claim.claimId.trim() || !claim.text.trim() || !claim.evidenceRefs.length || !claim.keyFactRefs.length) reasons.push("CLAIM_EVIDENCE_MISSING");
    if (requiredContractRefs.some((ref) => !claim.contractRefs.includes(ref))) reasons.push("CONTRACT_NOT_DECLARED");
    if (requiredChapterIntentRefs.some((ref) => !claim.chapterIntentRefs.includes(ref))) reasons.push("CHAPTER_INTENT_NOT_DECLARED");
    const claimUnsupported = claim.evidenceRefs.some((ref) => !selected.has(ref) || (input.sourceVersions?.[ref] !== undefined && input.sourceVersions[ref] !== selected.get(ref)));
    if (claimUnsupported) reasons.push("CLAIM_EVIDENCE_UNSUPPORTED");
    if (claim.scope === "supported" && claim.evidenceRefs.some((ref) => !claim.keyFactRefs.includes(ref))) reasons.push("CLAIM_SCOPE_UNSUPPORTED");
  }
  const uniqueReasons = [...new Set(reasons)];
  const base = { schemaVersion: "context-evidence-gate.v1" as const, status: uniqueReasons.length ? "conflicted" as const : "supported" as const, reasons: uniqueReasons, unsupportedSourceRefs };
  return { ...base, fingerprint: hash(base) };
}
