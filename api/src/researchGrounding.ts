import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { evaluateMemoryProjectionFreshness, type MemoryProjectionFreshness } from "./memoryProjectionGate.js";
import { resolveInside } from "./pathSafety.js";

export interface ResearchObligation { schemaVersion: "research-obligation.v1"; obligationId: string; assertion: string; domain: string; truthBoundary: "strictly-real" | "reasonable-approximation" | "fictionalized"; risk: "low" | "medium" | "high"; affectedAssets: string[]; requiresSource: boolean; fingerprint: string; }
export interface ResearchSourceSnapshot { schemaVersion: "research-source-snapshot.v1"; sourceId: string; sourceType: string; author: string; title: string; publishedAt: string; retrievedAt: string; region: string; locator: string; contentHash: string; acquisition: string; rights: string; reliabilitySignals: string[]; expiry: string; sanitizedContent: string; fingerprint: string; }
export interface ResearchClaim { schemaVersion: "research-claim.v1"; claimId: string; sourceSnapshotId: string; sourceText: string; paraphrase: string; status: "supported" | "contested" | "unknown"; anchor: string; region: string; asOf: string; conditions: string[]; counterEvidence: string[]; independentSourceIds: string[]; fingerprint: string; }
export interface ResearchClaimAssessment { status: "current" | "stale" | "contested" | "unknown"; reasons: string[]; fingerprint: string; }
export interface ResearchConsumptionReceipt { schemaVersion: "research-consumption-receipt.v1"; receiptId: string; claimId: string; sourceSnapshotId: string; assetRef: string; usage: string; adaptation: string; risk: string; span: { start: number; end: number }; status: "pending"; fingerprint: string; }
export interface ResearchSettlement { schemaVersion: "research-settlement.v1"; receiptId: string; status: "current" | "stale" | "waived"; decision: string; fingerprint: string; }
export interface ResearchConsumptionDecision { status: "current" | "stale" | "blocked" | "waived"; allowed: boolean; reasons: string[]; fingerprint: string; }
export interface ResearchSourceRevocation { schemaVersion: "research-source-revocation.v1"; sourceId: string; sourceFingerprint: string; reason: string; revokedAt: string; fingerprint: string; }
export interface ResearchClaimCorrection { schemaVersion: "research-claim-correction.v1"; claimId: string; previousFingerprint: string; replacementFingerprint: string; reason: string; correctedAt: string; fingerprint: string; }
export interface ResearchPublicationGateDecision { schemaVersion: "research-publication-gate.v1"; status: "allowed" | "blocked"; allowed: boolean; blockedReasons: string[]; warnings: string[]; affectedReceiptIds: string[]; affectedClaimIds?: string[]; memoryProjection?: MemoryProjectionFreshness; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertResearchClaimCorrectionIntegrity(correction: ResearchClaimCorrection, expectedClaimId?: string): ResearchClaimCorrection { const { fingerprint: _fingerprint, ...base } = correction; if (correction.schemaVersion !== "research-claim-correction.v1" || (expectedClaimId !== undefined && correction.claimId !== expectedClaimId) || !correction.claimId.trim() || !correction.previousFingerprint.trim() || !correction.replacementFingerprint.trim() || correction.previousFingerprint === correction.replacementFingerprint || !correction.reason.trim() || !Number.isFinite(Date.parse(correction.correctedAt)) || !/^[a-f0-9]{64}$/i.test(correction.fingerprint) || hash(base) !== correction.fingerprint) throw new Error("RESEARCH_CLAIM_CORRECTION_INTEGRITY_FAILED"); return correction; }

export function assertResearchSourceRevocationIntegrity(revocation: ResearchSourceRevocation, expectedSourceId?: string): ResearchSourceRevocation {
  const { fingerprint: _fingerprint, ...base } = revocation;
  if (revocation.schemaVersion !== "research-source-revocation.v1" || (expectedSourceId !== undefined && revocation.sourceId !== expectedSourceId) || typeof revocation.sourceId !== "string" || !revocation.sourceId.trim() || typeof revocation.sourceFingerprint !== "string" || !revocation.sourceFingerprint.trim() || typeof revocation.reason !== "string" || !revocation.reason.trim() || typeof revocation.revokedAt !== "string" || !Number.isFinite(Date.parse(revocation.revokedAt)) || !/^[a-f0-9]{64}$/i.test(revocation.fingerprint) || hash(base) !== revocation.fingerprint) throw new Error("RESEARCH_REVOCATION_INTEGRITY_FAILED");
  return revocation;
}

export function assertResearchSettlementIntegrity(settlement: ResearchSettlement, expectedReceiptId?: string): ResearchSettlement {
  const { fingerprint: _fingerprint, ...base } = settlement;
  const decisionValid = typeof settlement.decision === "string" && settlement.decision.trim();
  const statusValid = settlement.status === "waived" ? settlement.decision === "waive" : settlement.status === "stale" ? settlement.decision !== "current" && settlement.decision !== "waive" : settlement.status === "current" && settlement.decision === "current";
  if (settlement.schemaVersion !== "research-settlement.v1" || (expectedReceiptId !== undefined && settlement.receiptId !== expectedReceiptId) || !settlement.receiptId.trim() || !decisionValid || !["current", "stale", "waived"].includes(settlement.status) || !statusValid || !/^[a-f0-9]{64}$/i.test(settlement.fingerprint) || hash(base) !== settlement.fingerprint) throw new Error("RESEARCH_SETTLEMENT_INTEGRITY_FAILED");
  return settlement;
}

export function assertResearchSourceSnapshotIntegrity(snapshot: ResearchSourceSnapshot, expectedSourceId?: string): ResearchSourceSnapshot {
  const { fingerprint: _fingerprint, ...base } = snapshot;
  const fieldsValid = [snapshot.sourceId, snapshot.sourceType, snapshot.author, snapshot.title, snapshot.locator, snapshot.contentHash, snapshot.acquisition, snapshot.rights, snapshot.sanitizedContent].every((value) => typeof value === "string" && value.trim());
  const reliabilityValid = Array.isArray(snapshot.reliabilitySignals) && snapshot.reliabilitySignals.every((signal) => typeof signal === "string" && signal.trim());
  if (snapshot.schemaVersion !== "research-source-snapshot.v1" || (expectedSourceId !== undefined && snapshot.sourceId !== expectedSourceId) || !fieldsValid || !reliabilityValid || !/^[a-f0-9]{64}$/i.test(snapshot.fingerprint) || hash(base) !== snapshot.fingerprint) throw new Error("RESEARCH_SOURCE_INTEGRITY_FAILED");
  return snapshot;
}

export function assertResearchConsumptionReceiptIntegrity(receipt: ResearchConsumptionReceipt): ResearchConsumptionReceipt {
  const { fingerprint: _fingerprint, ...base } = receipt;
  const spanValid = receipt.span && Number.isInteger(receipt.span.start) && Number.isInteger(receipt.span.end) && receipt.span.start >= 0 && receipt.span.end > receipt.span.start;
  if (receipt.schemaVersion !== "research-consumption-receipt.v1" || receipt.status !== "pending" || !receipt.receiptId.trim() || !receipt.claimId.trim() || !receipt.sourceSnapshotId.trim() || !receipt.assetRef.trim() || !receipt.usage.trim() || !receipt.adaptation.trim() || !receipt.risk.trim() || !spanValid || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint) || hash(base) !== receipt.fingerprint) throw new Error("RESEARCH_RECEIPT_INTEGRITY_FAILED");
  return receipt;
}
function canonicalizeLocator(locator: string): string {
  try {
    const url = new URL(locator);
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\?$/, "");
  } catch { return locator.trim(); }
}
function sanitizeResearchContent(rawContent: string): string {
  return rawContent
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/ignore\s+(?:all\s+)?previous\s+instructions/gi, "[redacted-instruction]")
    .replace(/\b(?:system|developer|assistant|user)\s*:/gi, "[redacted-role]:")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "[redacted-secret]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/([?&](?:utm_[^=]+|fbclid|gclid|mc_cid|mc_eid)=[^&\s]+)/gi, "");
}
export function identifyResearchObligation(input: Omit<ResearchObligation, "schemaVersion" | "requiresSource" | "fingerprint">): ResearchObligation { if (!input.obligationId.trim() || !input.assertion.trim() || !input.domain.trim() || !input.affectedAssets.length) throw new Error("RESEARCH_OBLIGATION_FIELDS_REQUIRED"); const base = { schemaVersion: "research-obligation.v1" as const, ...input, affectedAssets: [...input.affectedAssets], requiresSource: input.truthBoundary === "strictly-real" || input.risk === "high" }; return { ...base, fingerprint: hash(base) }; }
export function assertResearchObligationIntegrity(obligation: ResearchObligation, expectedObligationId?: string): ResearchObligation { const { fingerprint: _fingerprint, ...base } = obligation; const assetsValid = Array.isArray(obligation.affectedAssets) && obligation.affectedAssets.length > 0 && obligation.affectedAssets.every((asset) => typeof asset === "string" && asset.trim()); if (obligation.schemaVersion !== "research-obligation.v1" || (expectedObligationId !== undefined && obligation.obligationId !== expectedObligationId) || !obligation.obligationId.trim() || !obligation.assertion.trim() || !obligation.domain.trim() || !assetsValid || !["strictly-real", "reasonable-approximation", "fictionalized"].includes(obligation.truthBoundary) || !["low", "medium", "high"].includes(obligation.risk) || typeof obligation.requiresSource !== "boolean" || obligation.requiresSource !== (obligation.truthBoundary === "strictly-real" || obligation.risk === "high") || !/^[a-f0-9]{64}$/i.test(obligation.fingerprint) || hash(base) !== obligation.fingerprint) throw new Error("RESEARCH_OBLIGATION_INTEGRITY_FAILED"); return obligation; }
export function createResearchSourceSnapshot(input: Omit<ResearchSourceSnapshot, "schemaVersion" | "sanitizedContent" | "fingerprint"> & { rawContent: string }): ResearchSourceSnapshot { if (!input.sourceId.trim() || !input.author.trim() || !input.title.trim() || !input.locator.trim() || !input.contentHash.trim() || !input.rights.trim()) throw new Error("RESEARCH_SOURCE_FIELDS_REQUIRED"); if (/^(unknown|undetermined|unlicensed|not-available)$/i.test(input.rights.trim())) throw new Error("RESEARCH_SOURCE_RIGHTS_REQUIRED"); const sanitizedContent = sanitizeResearchContent(input.rawContent); const { rawContent, ...rest } = input; const base = { schemaVersion: "research-source-snapshot.v1" as const, ...rest, locator: canonicalizeLocator(input.locator), reliabilitySignals: [...input.reliabilitySignals], sanitizedContent }; return { ...base, fingerprint: hash(base) }; }
export function createResearchClaim(input: Omit<ResearchClaim, "schemaVersion" | "fingerprint">): ResearchClaim { if (!input.claimId.trim() || !input.sourceSnapshotId.trim() || !input.sourceText.trim() || !input.paraphrase.trim() || !input.anchor.trim() || !input.region.trim() || !input.asOf.trim() || !input.independentSourceIds.length) throw new Error("RESEARCH_CLAIM_FIELDS_REQUIRED"); const base = { schemaVersion: "research-claim.v1" as const, ...input, conditions: [...input.conditions], counterEvidence: [...input.counterEvidence], independentSourceIds: [...input.independentSourceIds] }; return { ...base, fingerprint: hash(base) }; }
export function assertResearchClaimIntegrity(claim: ResearchClaim, expectedClaimId?: string): ResearchClaim { const { fingerprint: _fingerprint, ...base } = claim; const arraysValid = [claim.conditions, claim.counterEvidence, claim.independentSourceIds].every((values) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim())); if (claim.schemaVersion !== "research-claim.v1" || (expectedClaimId !== undefined && claim.claimId !== expectedClaimId) || !claim.claimId.trim() || !claim.sourceSnapshotId.trim() || !claim.sourceText.trim() || !claim.paraphrase.trim() || !claim.anchor.trim() || !claim.region.trim() || !claim.asOf.trim() || !["supported", "contested", "unknown"].includes(claim.status) || !claim.independentSourceIds.length || !arraysValid || !/^[a-f0-9]{64}$/i.test(claim.fingerprint) || hash(base) !== claim.fingerprint) throw new Error("RESEARCH_CLAIM_INTEGRITY_FAILED"); return claim; }
export function evaluateResearchClaim(input: { claim: ResearchClaim; source: ResearchSourceSnapshot | null; independentSources: ResearchSourceSnapshot[]; now: string; revoked?: boolean }): ResearchClaimAssessment {
  const reasons: string[] = [];
  if (!input.source || input.source.sourceId !== input.claim.sourceSnapshotId) reasons.push("SOURCE_SNAPSHOT_MISSING");
  const now = Date.parse(input.now);
  if (input.source?.expiry) {
    const expiry = Date.parse(input.source.expiry);
    if (!Number.isFinite(expiry) || !Number.isFinite(now)) reasons.push("SOURCE_TIME_UNRESOLVED");
    else if (expiry <= now) reasons.push("SOURCE_EXPIRED");
  }
  if (input.revoked) reasons.push("SOURCE_REVOKED");
  if (input.source && input.claim.region && input.source.region && input.claim.region !== input.source.region) reasons.push("REGION_MISMATCH");
  if (input.claim.status === "unknown") reasons.push("CLAIM_UNKNOWN");
  if (input.claim.status === "contested" || input.claim.counterEvidence.length) reasons.push("COUNTER_EVIDENCE_PRESENT");
  const sourceById = new Map(input.independentSources.map((source) => [source.sourceId, source]));
  const independentHashes = new Set(input.claim.independentSourceIds.map((id) => sourceById.get(id)?.contentHash).filter((value): value is string => Boolean(value)));
  if (input.claim.independentSourceIds.length > 1 && independentHashes.size < 2) reasons.push("SOURCE_FAMILY_NOT_INDEPENDENT");
  const status = reasons.includes("SOURCE_EXPIRED") || reasons.includes("SOURCE_REVOKED") ? "stale" as const : reasons.includes("COUNTER_EVIDENCE_PRESENT") ? "contested" as const : reasons.length ? "unknown" as const : "current" as const;
  const base = { status, reasons };
  return { ...base, fingerprint: hash(base) };
}
export function createResearchConsumptionReceipt(input: Omit<ResearchConsumptionReceipt, "schemaVersion" | "status" | "fingerprint">): ResearchConsumptionReceipt { if (!input.receiptId.trim() || !input.claimId.trim() || !input.sourceSnapshotId.trim() || !input.assetRef.trim() || !input.usage.trim() || input.span.end <= input.span.start) throw new Error("RESEARCH_RECEIPT_FIELDS_REQUIRED"); const base = { schemaVersion: "research-consumption-receipt.v1" as const, ...input, status: "pending" as const }; return { ...base, fingerprint: hash(base) }; }
export function evaluateResearchConsumption(input: { receipt: ResearchConsumptionReceipt; claimAssessment: ResearchClaimAssessment; factCheck?: { status: "supported" | "blocked"; evidenceRefs?: string[]; checkedClaimFingerprint?: string }; currentClaimFingerprint: string; consumedClaimFingerprint: string; authorWaiver?: boolean }): ResearchConsumptionDecision {
  const reasons: string[] = [];
  if (input.authorWaiver) return { status: "waived", allowed: true, reasons: ["AUTHOR_EXPLICIT_WAIVER"], fingerprint: hash({ status: "waived", allowed: true, reasons: ["AUTHOR_EXPLICIT_WAIVER"] }) };
  if (input.currentClaimFingerprint !== input.consumedClaimFingerprint) reasons.push("CLAIM_FINGERPRINT_CHANGED");
  if (input.claimAssessment.status !== "current") reasons.push(`CLAIM_${input.claimAssessment.status.toUpperCase()}`);
  const highRisk = input.receipt.risk.toLowerCase() === "high";
  if (highRisk && input.claimAssessment.status !== "current") reasons.push("HIGH_RISK_CLAIM_NOT_CURRENT");
  if (highRisk && !input.factCheck) reasons.push("HIGH_RISK_FACT_CHECK_REQUIRED");
  if (highRisk && input.factCheck?.status === "blocked") reasons.push("HIGH_RISK_FACT_CHECK_BLOCKED");
  if (highRisk && input.factCheck?.status === "supported" && input.factCheck.evidenceRefs !== undefined && input.factCheck.evidenceRefs.length === 0) reasons.push("HIGH_RISK_FACT_CHECK_EVIDENCE_REQUIRED");
  if (highRisk && input.factCheck?.checkedClaimFingerprint !== undefined && input.factCheck.checkedClaimFingerprint !== input.currentClaimFingerprint) reasons.push("HIGH_RISK_FACT_CHECK_STALE");
  const hardBlocked = highRisk && (input.claimAssessment.status !== "current" || !input.factCheck || input.factCheck.status === "blocked" || reasons.includes("HIGH_RISK_FACT_CHECK_EVIDENCE_REQUIRED") || reasons.includes("HIGH_RISK_FACT_CHECK_STALE"));
  const status = hardBlocked ? "blocked" as const : reasons.length ? "stale" as const : "current" as const;
  const base = { status, allowed: status === "current", reasons };
  return { ...base, fingerprint: hash(base) };
}
export function settleResearchClaim(input: { receipt: ResearchConsumptionReceipt; currentClaimFingerprint: string; consumedClaimFingerprint: string; decision: "current" | "rewrite" | "waive" }): ResearchSettlement { const status = input.decision === "waive" ? "waived" as const : input.currentClaimFingerprint !== input.consumedClaimFingerprint ? "stale" as const : "current" as const; const base = { schemaVersion: "research-settlement.v1" as const, receiptId: input.receipt.receiptId, status, decision: input.decision }; return { ...base, fingerprint: hash(base) }; }

function sourceSnapshotPath(root: string, sourceId: string): string { return resolveInside(root, `research/sources/${sourceId}.json`); }
function researchObligationPath(root: string, obligationId: string): string { return resolveInside(root, `research/obligations/${obligationId}.json`); }
export async function persistResearchObligation(root: string, obligation: ResearchObligation): Promise<{ created: boolean; obligation: ResearchObligation }> {
  assertResearchObligationIntegrity(obligation);
  const target = researchObligationPath(root, obligation.obligationId);
  try {
    const existing = assertResearchObligationIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchObligation);
    if (existing.fingerprint !== obligation.fingerprint) throw new Error("RESEARCH_OBLIGATION_IMMUTABLE");
    return { created: false, obligation: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(obligation, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, obligation };
}
export async function readResearchObligation(root: string, obligationId: string): Promise<ResearchObligation | null> { try { return assertResearchObligationIntegrity(JSON.parse(await fs.readFile(researchObligationPath(root, obligationId), "utf8")) as ResearchObligation, obligationId); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function researchClaimPath(root: string, claimId: string): string { return resolveInside(root, `research/claims/${claimId}.json`); }
export async function persistResearchClaim(root: string, claim: ResearchClaim): Promise<{ created: boolean; claim: ResearchClaim }> {
  assertResearchClaimIntegrity(claim);
  const target = researchClaimPath(root, claim.claimId);
  try {
    const existing = assertResearchClaimIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchClaim);
    if (existing.fingerprint !== claim.fingerprint) throw new Error("RESEARCH_CLAIM_IMMUTABLE");
    return { created: false, claim: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, claim };
}
export async function readResearchClaim(root: string, claimId: string): Promise<ResearchClaim | null> { try { return assertResearchClaimIntegrity(JSON.parse(await fs.readFile(researchClaimPath(root, claimId), "utf8")) as ResearchClaim, claimId); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function persistResearchSourceSnapshot(root: string, snapshot: ResearchSourceSnapshot): Promise<{ created: boolean; snapshot: ResearchSourceSnapshot }> {
  assertResearchSourceSnapshotIntegrity(snapshot);
  const target = sourceSnapshotPath(root, snapshot.sourceId);
  try {
    const existing = assertResearchSourceSnapshotIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchSourceSnapshot);
    if (existing.fingerprint !== snapshot.fingerprint) throw new Error("RESEARCH_SOURCE_IMMUTABLE");
    return { created: false, snapshot: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, snapshot };
}
export async function readResearchSourceSnapshot(root: string, sourceId: string): Promise<ResearchSourceSnapshot | null> {
  try { return assertResearchSourceSnapshotIntegrity(JSON.parse(await fs.readFile(sourceSnapshotPath(root, sourceId), "utf8")) as ResearchSourceSnapshot, sourceId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function consumptionReceiptPath(root: string, receiptId: string): string { return resolveInside(root, `research/consumption-receipts/${receiptId}.json`); }
export async function persistResearchConsumptionReceipt(root: string, receipt: ResearchConsumptionReceipt): Promise<{ created: boolean; receipt: ResearchConsumptionReceipt }> {
  assertResearchConsumptionReceiptIntegrity(receipt);
  const target = consumptionReceiptPath(root, receipt.receiptId);
  try {
    const existing = assertResearchConsumptionReceiptIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchConsumptionReceipt);
    if (existing.fingerprint !== receipt.fingerprint) throw new Error("RESEARCH_RECEIPT_IMMUTABLE");
    return { created: false, receipt: existing };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, receipt };
}
export async function readResearchConsumptionReceipt(root: string, receiptId: string): Promise<ResearchConsumptionReceipt | null> {
  try { return assertResearchConsumptionReceiptIntegrity(JSON.parse(await fs.readFile(consumptionReceiptPath(root, receiptId), "utf8")) as ResearchConsumptionReceipt); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function sourceRevocationPath(root: string, sourceId: string): string { return resolveInside(root, `research/revocations/${sourceId}.json`); }
function settlementPath(root: string, receiptId: string): string { return resolveInside(root, `research/settlements/${receiptId}.json`); }
export async function readResearchSettlement(root: string, receiptId: string): Promise<ResearchSettlement | null> {
  try { return assertResearchSettlementIntegrity(JSON.parse(await fs.readFile(settlementPath(root, receiptId), "utf8")) as ResearchSettlement, receiptId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function persistResearchSettlement(root: string, settlement: ResearchSettlement): Promise<{ created: boolean; settlement: ResearchSettlement }> {
  const target = settlementPath(root, settlement.receiptId);
  try {
    const existing = assertResearchSettlementIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchSettlement);
    if (existing.fingerprint === settlement.fingerprint) return { created: false, settlement: existing };
    const invalidation = existing.status === "current" && settlement.status === "stale";
    const explicitRevalidation = existing.status === "stale" && settlement.status === "current" && settlement.decision === "current";
    if (!invalidation && !explicitRevalidation) throw new Error("RESEARCH_SETTLEMENT_IMMUTABLE");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  assertResearchSettlementIntegrity(settlement);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, settlement };
}

export async function propagateResearchClaimAssessment(root: string, claimId: string, assessment: ResearchClaimAssessment): Promise<{ affectedReceiptIds: string[]; settlements: ResearchSettlement[] }> {
  if (!claimId.trim()) throw new Error("RESEARCH_CLAIM_ID_REQUIRED");
  if (assessment.status === "current") return { affectedReceiptIds: [], settlements: [] };
  const directory = resolveInside(root, "research/consumption-receipts");
  const names = await fs.readdir(directory).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [] as string[];
    throw error;
  });
  const settlements: ResearchSettlement[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const receipt = JSON.parse(await fs.readFile(resolveInside(directory, name), "utf8")) as ResearchConsumptionReceipt;
    if (receipt.claimId !== claimId) continue;
    const existing = await readResearchSettlement(root, receipt.receiptId);
    if (existing?.status === "stale") {
      settlements.push(existing);
      continue;
    }
    const base = { schemaVersion: "research-settlement.v1" as const, receiptId: receipt.receiptId, status: "stale" as const, decision: `CLAIM_${assessment.status.toUpperCase()}` };
    const settlement = { ...base, fingerprint: hash(base) };
    const target = settlementPath(root, receipt.receiptId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
    settlements.push(settlement);
  }
  return { affectedReceiptIds: settlements.map((item) => item.receiptId), settlements };
}
export async function revokeResearchSource(root: string, source: ResearchSourceSnapshot, reason: string, revokedAt = new Date().toISOString()): Promise<ResearchSourceRevocation> {
  assertResearchSourceSnapshotIntegrity(source);
  if (!reason.trim()) throw new Error("RESEARCH_REVOCATION_REASON_REQUIRED");
  const base = { schemaVersion: "research-source-revocation.v1" as const, sourceId: source.sourceId, sourceFingerprint: source.fingerprint, reason: reason.trim(), revokedAt };
  const revocation = { ...base, fingerprint: hash(base) };
  const target = sourceRevocationPath(root, source.sourceId);
  try {
    const existing = assertResearchSourceRevocationIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchSourceRevocation);
    if (existing.sourceFingerprint !== source.fingerprint) throw new Error("RESEARCH_REVOCATION_FINGERPRINT_MISMATCH");
    return existing;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(revocation, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return revocation;
}
export async function readResearchSourceRevocation(root: string, sourceId: string): Promise<ResearchSourceRevocation | null> {
  try { return assertResearchSourceRevocationIntegrity(JSON.parse(await fs.readFile(sourceRevocationPath(root, sourceId), "utf8")) as ResearchSourceRevocation, sourceId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export async function propagateResearchSourceRevocation(root: string, revocation: ResearchSourceRevocation): Promise<{ affectedReceiptIds: string[]; settlements: ResearchSettlement[] }> {
  assertResearchSourceRevocationIntegrity(revocation);
  const directory = resolveInside(root, "research/consumption-receipts");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return { affectedReceiptIds: [], settlements: [] }; throw error; }
  const settlements: ResearchSettlement[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const receipt = JSON.parse(await fs.readFile(resolveInside(directory, name), "utf8")) as ResearchConsumptionReceipt;
    if (receipt.sourceSnapshotId !== revocation.sourceId) continue;
    const base = { schemaVersion: "research-settlement.v1" as const, receiptId: receipt.receiptId, status: "stale" as const, decision: "SOURCE_REVOKED" };
    const settlement = { ...base, fingerprint: hash(base) };
    const target = settlementPath(root, receipt.receiptId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
    settlements.push(settlement);
  }
  return { affectedReceiptIds: settlements.map((item) => item.receiptId), settlements };
}

function claimCorrectionPath(root: string, claimId: string): string { return resolveInside(root, `research/corrections/${claimId}.json`); }
export async function correctResearchClaim(root: string, input: { claimId: string; previousFingerprint: string; replacementFingerprint: string; reason: string; correctedAt?: string }): Promise<ResearchClaimCorrection> {
  if (!input.claimId.trim() || !input.previousFingerprint.trim() || !input.replacementFingerprint.trim() || !input.reason.trim()) throw new Error("RESEARCH_CLAIM_CORRECTION_FIELDS_REQUIRED");
  const base = { schemaVersion: "research-claim-correction.v1" as const, claimId: input.claimId, previousFingerprint: input.previousFingerprint, replacementFingerprint: input.replacementFingerprint, reason: input.reason.trim(), correctedAt: input.correctedAt || new Date().toISOString() };
  const correction = { ...base, fingerprint: hash(base) };
  const target = claimCorrectionPath(root, input.claimId);
  try {
    const existing = assertResearchClaimCorrectionIntegrity(JSON.parse(await fs.readFile(target, "utf8")) as ResearchClaimCorrection, input.claimId);
    if (existing.fingerprint !== correction.fingerprint) throw new Error("RESEARCH_CLAIM_CORRECTION_IMMUTABLE");
    return existing;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  assertResearchClaimCorrectionIntegrity(correction, input.claimId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(correction, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return correction;
}
export async function propagateResearchClaimCorrection(root: string, correction: ResearchClaimCorrection): Promise<{ affectedReceiptIds: string[]; settlements: ResearchSettlement[] }> {
  const directory = resolveInside(root, "research/consumption-receipts");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return { affectedReceiptIds: [], settlements: [] }; throw error; }
  const settlements: ResearchSettlement[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const receipt = JSON.parse(await fs.readFile(resolveInside(directory, name), "utf8")) as ResearchConsumptionReceipt;
    if (receipt.claimId !== correction.claimId) continue;
    const base = { schemaVersion: "research-settlement.v1" as const, receiptId: receipt.receiptId, status: "stale" as const, decision: "CLAIM_CORRECTED" };
    const settlement = { ...base, fingerprint: hash(base) };
    const target = settlementPath(root, receipt.receiptId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(settlement, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
    settlements.push(settlement);
  }
  return { affectedReceiptIds: settlements.map((item) => item.receiptId), settlements };
}
export async function evaluateResearchPublicationGate(root: string): Promise<ResearchPublicationGateDecision> {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const affectedReceiptIds: string[] = [];
  const directory = resolveInside(root, "research/consumption-receipts");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") names = []; else throw error; }
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const receipt = JSON.parse(await fs.readFile(resolveInside(directory, name), "utf8")) as ResearchConsumptionReceipt;
    const settlementTarget = settlementPath(root, receipt.receiptId);
    let settlement: ResearchSettlement | null = null;
    try { settlement = JSON.parse(await fs.readFile(settlementTarget, "utf8")) as ResearchSettlement; } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; }
    if (!settlement || settlement.status !== "current") {
      affectedReceiptIds.push(receipt.receiptId);
      if (receipt.risk.toLowerCase() === "high") blockedReasons.push("HIGH_RISK_SETTLEMENT_REQUIRED");
      else warnings.push("LOW_RISK_SETTLEMENT_STALE_OR_MISSING");
    }
  }
  const memoryProjection = await evaluateMemoryProjectionFreshness(root);
  blockedReasons.push(...memoryProjection.blockingReasons);
  const base = { schemaVersion: "research-publication-gate.v1" as const, status: blockedReasons.length ? "blocked" as const : "allowed" as const, allowed: blockedReasons.length === 0, blockedReasons: [...new Set(blockedReasons)], warnings: [...new Set(warnings)], affectedReceiptIds, affectedClaimIds: memoryProjection.affectedClaimIds, memoryProjection };
  return { ...base, fingerprint: hash(base) };
}
