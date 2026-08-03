import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type MemoryClaimEpistemicType = "canon_fact" | "author_truth" | "reader_known" | "character_belief" | "plan" | "inference" | "hypothesis" | "obsolete";
export type MemoryClaimStatus = "candidate" | "eligible" | "contested" | "obsolete";
export interface MemoryClaim {
  schemaVersion: "memory-claim.v1";
  claimId: string;
  proposition: string;
  epistemicType: MemoryClaimEpistemicType;
  status: MemoryClaimStatus;
  version: number;
  sourceRefs: string[];
  sourceVersions?: string[];
  evidenceAnchors: string[];
  producedBy: "author" | "chapter-settlement" | "system-inference";
  confirmer?: string;
  temporalScope: { startEvent?: string; endEvent?: string; asOfVersion: string };
  confidence: number;
  parentVersion?: number;
  fingerprint: string;
}
export interface MemoryClaimEvent { schemaVersion: "memory-claim-event.v1"; eventId: string; claimId: string; eventType: "created" | "settled" | "obsoleted"; claim: MemoryClaim; reason: string; createdAt: string; fingerprint: string; }
export type MemoryClaimRelationType = "supports" | "contradicts" | "supersedes" | "refines" | "retracts";
export interface MemoryClaimRelation { schemaVersion: "memory-claim-relation.v1"; relationId: string; fromClaimId: string; toClaimId: string; relation: MemoryClaimRelationType; sourceRefs: string[]; validFromVersion?: string; createdAt?: string; revokedAt?: string; fingerprint: string; }
export interface MemoryClaimRelationRevocation { schemaVersion: "memory-claim-relation-revocation.v1"; revocationId: string; relationId: string; revokedAt: string; reason: string; sourceRefs: string[]; fingerprint: string; }
export interface MemoryContradictionSet { schemaVersion: "memory-contradiction-set.v1"; setId: string; claimIds: string[]; relationIds: string[]; status: "unresolved"; fingerprint: string; }
type NewMemoryClaimRelation = Omit<MemoryClaimRelation, "schemaVersion" | "relationId" | "fingerprint" | "validFromVersion"> & { validFromVersion: string };

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const claimsDir = (root: string) => resolveInside(root, "memory/claims");
const currentPath = (root: string) => resolveInside(root, "memory/claims/current.json");
const eventsPath = (root: string) => resolveInside(root, "memory/claims/events.jsonl");
const epistemicTypes: MemoryClaimEpistemicType[] = ["canon_fact", "author_truth", "reader_known", "character_belief", "plan", "inference", "hypothesis", "obsolete"];
const claimStatuses: MemoryClaimStatus[] = ["candidate", "eligible", "contested", "obsolete"];
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function refsValid(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
export function assertMemoryClaimIntegrity(claim: MemoryClaim): MemoryClaim {
  const { fingerprint, ...base } = claim;
  const temporalValid = Boolean(claim.temporalScope && nonEmpty(claim.temporalScope.asOfVersion) && (claim.temporalScope.startEvent === undefined || nonEmpty(claim.temporalScope.startEvent)) && (claim.temporalScope.endEvent === undefined || nonEmpty(claim.temporalScope.endEvent)));
  const valid = claim.schemaVersion === "memory-claim.v1" && [claim.claimId, claim.proposition].every(nonEmpty) && epistemicTypes.includes(claim.epistemicType) && claimStatuses.includes(claim.status) && Number.isInteger(claim.version) && claim.version >= 1 && refsValid(claim.sourceRefs, true) && (claim.sourceVersions === undefined || refsValid(claim.sourceVersions, true)) && refsValid(claim.evidenceAnchors, true) && ["author", "chapter-settlement", "system-inference"].includes(claim.producedBy) && (claim.confirmer === undefined || nonEmpty(claim.confirmer)) && temporalValid && Number.isFinite(claim.confidence) && claim.confidence >= 0 && claim.confidence <= 1 && (claim.parentVersion === undefined || (Number.isInteger(claim.parentVersion) && claim.parentVersion >= 1 && claim.parentVersion < claim.version)) && /^[a-f0-9]{64}$/i.test(claim.fingerprint) && hash(base) === claim.fingerprint;
  if (!valid) throw new Error("MEMORY_CLAIM_INTEGRITY_FAILED");
  return claim;
}
export function assertMemoryClaimEventIntegrity(event: MemoryClaimEvent): MemoryClaimEvent {
  const { fingerprint, ...base } = event;
  const expectedStatus: Record<MemoryClaimEvent["eventType"], MemoryClaimStatus> = { created: "candidate", settled: "eligible", obsoleted: "obsolete" };
  const valid = event.schemaVersion === "memory-claim-event.v1" && [event.eventId, event.claimId, event.reason, event.createdAt].every(nonEmpty) && ["created", "settled", "obsoleted"].includes(event.eventType) && event.claimId === event.claim.claimId && event.claim.status === expectedStatus[event.eventType] && Number.isFinite(Date.parse(event.createdAt)) && /^[a-f0-9]{64}$/i.test(event.fingerprint) && hash(base) === event.fingerprint;
  if (!valid) throw new Error("MEMORY_CLAIM_EVENT_INTEGRITY_FAILED");
  assertMemoryClaimIntegrity(event.claim);
  return event;
}

function claimBase(input: Omit<MemoryClaim, "schemaVersion" | "status" | "version" | "fingerprint">): Omit<MemoryClaim, "fingerprint"> {
  if (!input.claimId.trim() || !input.proposition.trim() || !input.sourceRefs.length || !input.temporalScope.asOfVersion.trim()) throw new Error("MEMORY_CLAIM_FIELDS_REQUIRED");
  if (!input.evidenceAnchors.length || input.evidenceAnchors.some((anchor) => !anchor.trim())) throw new Error("MEMORY_CLAIM_EVIDENCE_REQUIRED");
  if (input.confidence < 0 || input.confidence > 1) throw new Error("MEMORY_CLAIM_CONFIDENCE_INVALID");
  const sourceVersions = input.sourceVersions?.length ? input.sourceVersions : [input.temporalScope.asOfVersion];
  if (!sourceVersions.every((version) => version.trim())) throw new Error("MEMORY_CLAIM_SOURCE_VERSION_REQUIRED");
  return { schemaVersion: "memory-claim.v1", ...input, status: "candidate", version: 1, sourceRefs: [...new Set(input.sourceRefs)], sourceVersions: [...new Set(sourceVersions)], evidenceAnchors: [...new Set(input.evidenceAnchors)], temporalScope: { ...input.temporalScope } };
}

export function createMemoryClaim(input: Omit<MemoryClaim, "schemaVersion" | "status" | "version" | "fingerprint">): MemoryClaim {
  const base = claimBase(input);
  return { ...base, fingerprint: hash(base) };
}

export function evaluateMemoryClaimTemporal(input: { claim: MemoryClaim; targetEvent: string; eventOrder: Record<string, number> }): { status: "active" | "not-yet-active" | "expired" | "unknown"; reason: string } {
  const target = input.eventOrder[input.targetEvent];
  if (target === undefined) return { status: "unknown", reason: "TARGET_EVENT_UNORDERED" };
  const start = input.claim.temporalScope.startEvent ? input.eventOrder[input.claim.temporalScope.startEvent] : undefined;
  const end = input.claim.temporalScope.endEvent ? input.eventOrder[input.claim.temporalScope.endEvent] : undefined;
  if (input.claim.temporalScope.startEvent && start === undefined) return { status: "unknown", reason: "START_EVENT_UNORDERED" };
  if (input.claim.temporalScope.endEvent && end === undefined) return { status: "unknown", reason: "END_EVENT_UNORDERED" };
  if (start !== undefined && target < start) return { status: "not-yet-active", reason: "BEFORE_START_EVENT" };
  if (end !== undefined && target >= end) return { status: "expired", reason: "AT_OR_AFTER_END_EVENT" };
  return { status: "active", reason: "WITHIN_TEMPORAL_SCOPE" };
}

export function createMemoryClaimRelation(input: NewMemoryClaimRelation): MemoryClaimRelation {
  if (!input.fromClaimId.trim() || !input.toClaimId.trim() || input.fromClaimId === input.toClaimId || !input.sourceRefs.length) throw new Error("MEMORY_CLAIM_RELATION_FIELDS_REQUIRED");
  if (!input.validFromVersion?.trim()) throw new Error("MEMORY_CLAIM_RELATION_VERSION_REQUIRED");
  const base = { schemaVersion: "memory-claim-relation.v1" as const, relationId: `memory-claim-relation-${crypto.randomUUID()}`, ...input, createdAt: input.createdAt || new Date().toISOString(), sourceRefs: [...new Set(input.sourceRefs)] };
  return { ...base, fingerprint: hash(base) };
}

export function assertMemoryClaimRelationIntegrity(relation: MemoryClaimRelation): MemoryClaimRelation {
  const { fingerprint, ...base } = relation;
  const valid = relation?.schemaVersion === "memory-claim-relation.v1" && [relation.relationId, relation.fromClaimId, relation.toClaimId].every(nonEmpty) && relation.fromClaimId !== relation.toClaimId && ["supports", "contradicts", "supersedes", "refines", "retracts"].includes(relation.relation) && refsValid(relation.sourceRefs, true) && (relation.validFromVersion === undefined || nonEmpty(relation.validFromVersion)) && (relation.createdAt === undefined || Number.isFinite(Date.parse(relation.createdAt))) && (relation.revokedAt === undefined || Number.isFinite(Date.parse(relation.revokedAt))) && /^[a-f0-9]{64}$/i.test(relation.fingerprint) && hash(base) === relation.fingerprint;
  if (!valid) throw new Error("MEMORY_CLAIM_RELATION_INTEGRITY_FAILED");
  return relation;
}

const relationsPath = (root: string) => resolveInside(root, "memory/claims/relations.jsonl");
const relationRevocationsPath = (root: string) => resolveInside(root, "memory/claims/relation-revocations.jsonl");

export async function persistMemoryClaimRelation(root: string, relation: MemoryClaimRelation): Promise<MemoryClaimRelation> {
  assertMemoryClaimRelationIntegrity(relation);
  const existing = await listMemoryClaimRelations(root);
  const match = existing.find((item) => item.relationId === relation.relationId);
  if (match) {
    if (match.fingerprint !== relation.fingerprint) throw new Error("MEMORY_CLAIM_RELATION_CONFLICT");
    return match;
  }
  const target = relationsPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(relation)}\n`, "utf8");
  return relation;
}

export function assertMemoryClaimRelationRevocationIntegrity(event: MemoryClaimRelationRevocation): MemoryClaimRelationRevocation {
  const { fingerprint, ...base } = event;
  if (event.schemaVersion !== "memory-claim-relation-revocation.v1" || !/^memory-relation-revocation-/.test(event.revocationId) || !event.relationId.trim() || !Number.isFinite(Date.parse(event.revokedAt)) || !event.reason.trim() || !refsValid(event.sourceRefs, true) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("MEMORY_CLAIM_RELATION_REVOCATION_INTEGRITY_FAILED");
  return event;
}

export async function persistMemoryClaimRelationRevocation(root: string, input: { relationId: string; reason: string; sourceRefs: readonly string[] }): Promise<MemoryClaimRelationRevocation> {
  if (!input.relationId.trim() || !input.reason.trim() || !input.sourceRefs.length) throw new Error("MEMORY_CLAIM_RELATION_REVOCATION_FIELDS_REQUIRED");
  const relations = await listMemoryClaimRelations(root);
  const relation = relations.find((item) => item.relationId === input.relationId);
  if (!relation) throw new Error("MEMORY_CLAIM_RELATION_NOT_FOUND");
  if (relation.revokedAt) throw new Error("MEMORY_CLAIM_RELATION_ALREADY_REVOKED");
  const base = { schemaVersion: "memory-claim-relation-revocation.v1" as const, revocationId: `memory-relation-revocation-${crypto.randomUUID()}`, relationId: input.relationId, revokedAt: new Date().toISOString(), reason: input.reason.trim(), sourceRefs: [...new Set(input.sourceRefs)] };
  const event = { ...base, fingerprint: hash(base) };
  const target = relationRevocationsPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function listMemoryClaimRelations(root: string): Promise<MemoryClaimRelation[]> {
  try {
    const content = await fs.readFile(relationsPath(root), "utf8");
    const relations = content.split(/\r?\n/).filter(Boolean).map((line) => assertMemoryClaimRelationIntegrity(JSON.parse(line) as MemoryClaimRelation));
    let revocations: MemoryClaimRelationRevocation[] = [];
    try { revocations = (await fs.readFile(relationRevocationsPath(root), "utf8")).split(/\r?\n/).filter(Boolean).map((line) => assertMemoryClaimRelationRevocationIntegrity(JSON.parse(line) as MemoryClaimRelationRevocation)); } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; }
    const latest = new Map(revocations.map((event) => [event.relationId, event]));
    return relations.map((relation) => { const event = latest.get(relation.relationId); if (!event) return relation; const { fingerprint: _fingerprint, ...withoutFingerprint } = relation; const next = { ...withoutFingerprint, revokedAt: event.revokedAt }; return { ...next, fingerprint: hash(next) }; }).sort((left, right) => left.relationId.localeCompare(right.relationId));
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
}

export function buildMemoryContradictionSets(claims: MemoryClaim[], relations: MemoryClaimRelation[]): MemoryContradictionSet[] {
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  const parent = new Map<string, string>([...claimIds].map((id) => [id, id]));
  const find = (id: string): string => { const current = parent.get(id) || id; if (current === id) return id; const root = find(current); parent.set(id, root); return root; };
  const union = (left: string, right: string) => { const a = find(left); const b = find(right); if (a !== b) parent.set(b, a); };
  for (const relation of relations) if (relation.relation === "contradicts" && claimIds.has(relation.fromClaimId) && claimIds.has(relation.toClaimId) && !relation.revokedAt) union(relation.fromClaimId, relation.toClaimId);
  const grouped = new Map<string, { claims: string[]; relations: string[] }>();
  for (const relation of relations) if (relation.relation === "contradicts" && !relation.revokedAt && claimIds.has(relation.fromClaimId) && claimIds.has(relation.toClaimId)) { const root = find(relation.fromClaimId); const group = grouped.get(root) || { claims: [], relations: [] }; group.claims.push(relation.fromClaimId, relation.toClaimId); group.relations.push(relation.relationId); grouped.set(root, group); }
  return [...grouped.values()].map((group) => { const base = { schemaVersion: "memory-contradiction-set.v1" as const, setId: `contradiction-set-${hash(group.claims.sort())}`, claimIds: [...new Set(group.claims)].sort(), relationIds: [...new Set(group.relations)].sort(), status: "unresolved" as const }; return { ...base, fingerprint: hash(base) }; }).sort((left, right) => left.setId.localeCompare(right.setId));
}

export function settleMemoryClaim(input: { claim: MemoryClaim; chapterSettlementCompleted: boolean; confirmer: string; reason: string; }): MemoryClaim {
  if (!input.chapterSettlementCompleted) throw new Error("MEMORY_CLAIM_CHAPTER_SETTLEMENT_REQUIRED");
  if (!input.confirmer.trim() || !input.reason.trim()) throw new Error("MEMORY_CLAIM_CONFIRMATION_REQUIRED");
  if (!input.claim.evidenceAnchors.length) throw new Error("MEMORY_CLAIM_EVIDENCE_REQUIRED");
  if (input.claim.epistemicType === "plan" || input.claim.epistemicType === "inference" || input.claim.epistemicType === "hypothesis" || input.claim.epistemicType === "character_belief" || input.claim.epistemicType === "obsolete") throw new Error("MEMORY_CLAIM_EPISTEMIC_TYPE_NOT_CANON_ELIGIBLE");
  const { fingerprint: _oldFingerprint, ...claimWithoutFingerprint } = input.claim;
  const base = { ...claimWithoutFingerprint, status: "eligible" as const, version: input.claim.version + 1, producedBy: "chapter-settlement" as const, confirmer: input.confirmer.trim(), parentVersion: input.claim.version };
  return { ...base, fingerprint: hash(base) };
}

export function retconMemoryClaim(input: { claim: MemoryClaim; replacementProposition: string; replacementEvidenceAnchors: string[]; confirmer: string; reason: string }): { obsolete: MemoryClaim; replacement: MemoryClaim } {
  if (input.claim.status !== "eligible") throw new Error("MEMORY_CLAIM_RETCON_REQUIRES_ELIGIBLE_CLAIM");
  if (!input.confirmer.trim() || !input.reason.trim()) throw new Error("MEMORY_CLAIM_RETCON_CONFIRMATION_REQUIRED");
  if (!input.replacementProposition.trim() || !input.replacementEvidenceAnchors.length) throw new Error("MEMORY_CLAIM_RETCON_EVIDENCE_REQUIRED");
  const { fingerprint: _oldFingerprint, ...claimWithoutFingerprint } = input.claim;
  const obsoleteBase = { ...claimWithoutFingerprint, status: "obsolete" as const, confirmer: input.confirmer.trim() };
  const obsolete = { ...obsoleteBase, fingerprint: hash(obsoleteBase) };
  const { fingerprint: _obsoleteFingerprint, ...obsoleteWithoutFingerprint } = obsolete;
  const replacementBase = { ...obsoleteWithoutFingerprint, status: "candidate" as const, proposition: input.replacementProposition.trim(), evidenceAnchors: [...new Set(input.replacementEvidenceAnchors)], version: input.claim.version + 1, parentVersion: input.claim.version, producedBy: "author" as const };
  const replacement = { ...replacementBase, fingerprint: hash(replacementBase) };
  return { obsolete, replacement };
}

async function appendEvent(root: string, event: MemoryClaimEvent): Promise<void> {
  await fs.mkdir(claimsDir(root), { recursive: true });
  await fs.appendFile(eventsPath(root), `${JSON.stringify(event)}\n`, "utf8");
  const target = currentPath(root);
  let claims: MemoryClaim[] = [];
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf8")) as MemoryClaim | MemoryClaim[];
    claims = Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  claims = [...claims.filter((claim) => claim.claimId !== event.claim.claimId), event.claim].sort((left, right) => left.claimId.localeCompare(right.claimId));
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(claims, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function persistMemoryClaim(root: string, claim: MemoryClaim, eventType: MemoryClaimEvent["eventType"], reason: string): Promise<MemoryClaimEvent> {
  assertMemoryClaimIntegrity(claim);
  if (!reason.trim()) throw new Error("MEMORY_CLAIM_EVENT_REASON_REQUIRED");
  if (eventType === "created") {
    const existing = await readMemoryClaim(root, claim.claimId);
    if (existing && existing.fingerprint !== claim.fingerprint && claim.parentVersion === undefined) throw new Error("MEMORY_CLAIM_ID_CONFLICT");
  }
  const eventBase = { schemaVersion: "memory-claim-event.v1" as const, eventId: `memory-claim-event-${crypto.randomUUID()}`, claimId: claim.claimId, eventType, claim, reason, createdAt: new Date().toISOString() };
  const event = { ...eventBase, fingerprint: hash(eventBase) };
  assertMemoryClaimEventIntegrity(event);
  await appendEvent(root, event);
  return event;
}

export async function readMemoryClaim(root: string, claimId?: string): Promise<MemoryClaim | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(currentPath(root), "utf8")) as MemoryClaim | MemoryClaim[];
    const claims = Array.isArray(parsed) ? parsed : [parsed];
    claims.forEach(assertMemoryClaimIntegrity);
    return claims.find((claim) => !claimId || claim.claimId === claimId) || null;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
export async function listMemoryClaims(root: string): Promise<MemoryClaim[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(currentPath(root), "utf8")) as MemoryClaim | MemoryClaim[];
    const claims = Array.isArray(parsed) ? parsed : [parsed]; claims.forEach(assertMemoryClaimIntegrity); return claims.sort((left, right) => left.claimId.localeCompare(right.claimId));
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
}
