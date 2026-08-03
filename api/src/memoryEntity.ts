import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type MemoryEntityKind = "character" | "location" | "organization" | "object" | "event";
export interface MemoryEntityIdentity { schemaVersion: "memory-entity-identity.v1"; entityId: string; kind: MemoryEntityKind; canonicalName: string; status: "active" | "split" | "merged"; sourceRefs: string[]; fingerprint: string; }
export interface AliasAssertion { schemaVersion: "alias-assertion.v1"; assertionId: string; fromEntityId: string; alias: string; relation: "alias-of" | "disguise-of" | "same-as"; toEntityId: string; status: "proposed" | "confirmed" | "revoked"; evidenceRefs: string[]; knowledgeScope: "author" | "reader-known" | "character-known"; validFromEvent?: string; validToEvent?: string; fingerprint: string; }
export interface MemoryEntityEvent {
  schemaVersion: "memory-entity-event.v1";
  eventId: string;
  eventType: "created" | "updated" | "merged" | "split";
  entity: MemoryEntityIdentity;
  relatedEntityIds?: string[];
  replacementEntityIds?: string[];
  evidenceRefs?: string[];
  reason?: string;
  createdAt: string;
  fingerprint: string;
}
export interface MemoryEntityLineage {
  entityId: string;
  relation: "merged-into" | "split-into";
  relatedEntityId: string;
  eventId: string;
  evidenceRefs: string[];
}
export interface MemoryEntityReplay {
  entities: MemoryEntityIdentity[];
  lineage: MemoryEntityLineage[];
  fingerprint: string;
}
interface AliasAssertionEvent { schemaVersion: "alias-assertion-event.v1"; eventId: string; eventType: "created" | "confirmed" | "revoked"; assertion: AliasAssertion; createdAt: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const entityKinds: MemoryEntityKind[] = ["character", "location", "organization", "object", "event"];
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function refsValid(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
export function assertMemoryEntityIdentityIntegrity(entity: MemoryEntityIdentity): MemoryEntityIdentity {
  const { fingerprint, ...base } = entity;
  const valid = entity.schemaVersion === "memory-entity-identity.v1" && [entity.entityId, entity.canonicalName].every(nonEmpty) && entityKinds.includes(entity.kind) && ["active", "split", "merged"].includes(entity.status) && refsValid(entity.sourceRefs, true) && /^[a-f0-9]{64}$/i.test(entity.fingerprint) && hash(base) === entity.fingerprint;
  if (!valid) throw new Error("MEMORY_ENTITY_INTEGRITY_FAILED");
  return entity;
}
export function assertAliasAssertionIntegrity(assertion: AliasAssertion): AliasAssertion {
  const { fingerprint, ...base } = assertion;
  const valid = assertion.schemaVersion === "alias-assertion.v1" && [assertion.assertionId, assertion.fromEntityId, assertion.alias, assertion.toEntityId].every(nonEmpty) && assertion.fromEntityId !== assertion.toEntityId && ["alias-of", "disguise-of", "same-as"].includes(assertion.relation) && ["proposed", "confirmed", "revoked"].includes(assertion.status) && refsValid(assertion.evidenceRefs, true) && ["author", "reader-known", "character-known"].includes(assertion.knowledgeScope) && (assertion.validFromEvent === undefined || nonEmpty(assertion.validFromEvent)) && (assertion.validToEvent === undefined || nonEmpty(assertion.validToEvent)) && /^[a-f0-9]{64}$/i.test(assertion.fingerprint) && hash(base) === assertion.fingerprint;
  if (!valid) throw new Error("ALIAS_ASSERTION_INTEGRITY_FAILED");
  return assertion;
}
export function assertMemoryEntityEventIntegrity(event: MemoryEntityEvent): MemoryEntityEvent {
  const { fingerprint, ...base } = event;
  const valid = event?.schemaVersion === "memory-entity-event.v1" && typeof event.eventId === "string" && event.eventId.trim() && ["created", "updated", "merged", "split"].includes(event.eventType) && event.entity && event.entity.entityId && Array.isArray(event.evidenceRefs ?? []) && (event.evidenceRefs ?? []).every((ref) => typeof ref === "string" && ref.trim()) && (event.reason === undefined || (typeof event.reason === "string" && event.reason.trim())) && typeof event.createdAt === "string" && Number.isFinite(Date.parse(event.createdAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("MEMORY_ENTITY_EVENT_INTEGRITY_FAILED");
  assertMemoryEntityIdentityIntegrity(event.entity);
  return event;
}
export function assertAliasAssertionEventIntegrity(event: AliasAssertionEvent): AliasAssertionEvent {
  const { fingerprint, ...base } = event;
  const valid = event?.schemaVersion === "alias-assertion-event.v1" && typeof event.eventId === "string" && event.eventId.trim() && ["created", "confirmed", "revoked"].includes(event.eventType) && event.assertion && typeof event.createdAt === "string" && Number.isFinite(Date.parse(event.createdAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("ALIAS_ASSERTION_EVENT_INTEGRITY_FAILED");
  assertAliasAssertionIntegrity(event.assertion);
  return event;
}

export function createMemoryEntityIdentity(input: Omit<MemoryEntityIdentity, "schemaVersion" | "status" | "fingerprint">): MemoryEntityIdentity {
  if (!input.entityId.trim() || !input.canonicalName.trim() || !input.kind || !input.sourceRefs.length) throw new Error("MEMORY_ENTITY_FIELDS_REQUIRED");
  const base = { schemaVersion: "memory-entity-identity.v1" as const, ...input, status: "active" as const, sourceRefs: [...new Set(input.sourceRefs)] };
  return { ...base, fingerprint: hash(base) };
}

export function createAliasAssertion(input: Omit<AliasAssertion, "schemaVersion" | "assertionId" | "status" | "fingerprint">): AliasAssertion {
  if (!input.fromEntityId.trim() || !input.toEntityId.trim() || input.fromEntityId === input.toEntityId || !input.alias.trim() || !input.evidenceRefs.length) throw new Error("ALIAS_ASSERTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "alias-assertion.v1" as const, assertionId: `alias-assertion-${crypto.randomUUID()}`, ...input, status: "proposed" as const, evidenceRefs: [...new Set(input.evidenceRefs)] };
  return { ...base, fingerprint: hash(base) };
}

export function confirmAliasAssertion(assertion: AliasAssertion, input: { confirmer: string; evidenceRefs?: string[] }): AliasAssertion {
  if (!input.confirmer.trim() || !assertion.evidenceRefs.length || assertion.status === "revoked") throw new Error("ALIAS_ASSERTION_CONFIRMATION_REQUIRED");
  const { fingerprint: _oldFingerprint, ...assertionWithoutFingerprint } = assertion;
  const base = { ...assertionWithoutFingerprint, status: "confirmed" as const, evidenceRefs: [...new Set([...assertion.evidenceRefs, ...(input.evidenceRefs || [])])] };
  return { ...base, fingerprint: hash(base) };
}

export function resolveMemoryAlias(input: { entities: MemoryEntityIdentity[]; assertions: AliasAssertion[]; alias: string }): { status: "resolved" | "ambiguous" | "unknown"; entityIds: string[]; reason: string } {
  const matches = input.assertions.filter((assertion) => assertion.alias === input.alias && assertion.status === "confirmed").map((assertion) => assertion.toEntityId);
  const known = matches.filter((id) => input.entities.some((entity) => entity.entityId === id));
  if (known.length === 1) return { status: "resolved", entityIds: known, reason: "CONFIRMED_ALIAS_ASSERTION" };
  if (known.length > 1) return { status: "ambiguous", entityIds: [...new Set(known)].sort(), reason: "MULTIPLE_CONFIRMED_ALIAS_TARGETS" };
  return { status: "unknown", entityIds: [], reason: "NO_CONFIRMED_ALIAS_ASSERTION" };
}

export function replayMemoryEntityEvents(events: MemoryEntityEvent[]): MemoryEntityReplay {
  const entities = new Map<string, MemoryEntityIdentity>();
  const lineage: MemoryEntityLineage[] = [];
  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId));
  for (const event of ordered) {
    if (event.schemaVersion !== "memory-entity-event.v1") continue;
    entities.set(event.entity.entityId, event.entity);
    const related = [...new Set(event.replacementEntityIds || event.relatedEntityIds || [])].filter(Boolean).sort();
    if (event.eventType === "merged") for (const relatedEntityId of related) lineage.push({ entityId: event.entity.entityId, relation: "merged-into", relatedEntityId, eventId: event.eventId, evidenceRefs: [...new Set(event.evidenceRefs || [])].sort() });
    if (event.eventType === "split") for (const relatedEntityId of related) lineage.push({ entityId: event.entity.entityId, relation: "split-into", relatedEntityId, eventId: event.eventId, evidenceRefs: [...new Set(event.evidenceRefs || [])].sort() });
  }
  const resultBase = { entities: [...entities.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)), lineage: lineage.sort((a, b) => `${a.entityId}:${a.relatedEntityId}:${a.relation}`.localeCompare(`${b.entityId}:${b.relatedEntityId}:${b.relation}`)) };
  return { ...resultBase, fingerprint: hash(resultBase) };
}

export function mergeMemoryEntities(input: { sourceEntities: MemoryEntityIdentity[]; targetEntity: MemoryEntityIdentity; confirmer: string; evidenceRefs: string[]; reason: string }): { entities: MemoryEntityIdentity[]; events: MemoryEntityEvent[] } {
  if (!input.confirmer.trim() || !input.reason.trim() || !input.evidenceRefs.length || input.sourceEntities.length < 2) throw new Error("MEMORY_ENTITY_MERGE_EVIDENCE_REQUIRED");
  if (input.sourceEntities.some((entity) => entity.entityId === input.targetEntity.entityId)) throw new Error("MEMORY_ENTITY_MERGE_TARGET_CONFLICT");
  const now = new Date().toISOString();
  const sources = input.sourceEntities.map((entity) => { const { fingerprint: _oldFingerprint, ...withoutFingerprint } = entity; const base = { ...withoutFingerprint, status: "merged" as const }; return { ...base, fingerprint: hash(base) }; });
  const { fingerprint: _targetFingerprint, ...targetWithoutFingerprint } = input.targetEntity;
  const targetBase = { ...targetWithoutFingerprint, status: "active" as const, sourceRefs: [...new Set([...input.targetEntity.sourceRefs, ...input.sourceEntities.flatMap((entity) => entity.sourceRefs)])].sort() };
  const target = { ...targetBase, fingerprint: hash(targetBase) };
  const events = sources.map((entity) => {
    const base: Omit<MemoryEntityEvent, "fingerprint"> = { schemaVersion: "memory-entity-event.v1", eventId: `memory-entity-event-${crypto.randomUUID()}`, eventType: "merged", entity, replacementEntityIds: [target.entityId], evidenceRefs: [...new Set(input.evidenceRefs)].sort(), reason: input.reason, createdAt: now };
    return { ...base, fingerprint: hash(base) };
  });
  return { entities: [...sources, target], events };
}

export function splitMemoryEntity(input: { sourceEntity: MemoryEntityIdentity; replacementEntities: MemoryEntityIdentity[]; confirmer: string; evidenceRefs: string[]; reason: string }): { entities: MemoryEntityIdentity[]; events: MemoryEntityEvent[] } {
  if (!input.confirmer.trim() || !input.reason.trim() || !input.evidenceRefs.length || input.replacementEntities.length < 2) throw new Error("MEMORY_ENTITY_SPLIT_EVIDENCE_REQUIRED");
  if (input.replacementEntities.some((entity) => entity.entityId === input.sourceEntity.entityId) || new Set(input.replacementEntities.map((entity) => entity.entityId)).size !== input.replacementEntities.length) throw new Error("MEMORY_ENTITY_SPLIT_TARGET_CONFLICT");
  const now = new Date().toISOString();
  const { fingerprint: _sourceFingerprint, ...sourceWithoutFingerprint } = input.sourceEntity;
  const sourceBase = { ...sourceWithoutFingerprint, status: "split" as const };
  const source = { ...sourceBase, fingerprint: hash(sourceBase) };
  const replacements = input.replacementEntities.map((entity) => { const { fingerprint: _replacementFingerprint, ...withoutFingerprint } = entity; const base = { ...withoutFingerprint, status: "active" as const }; return { ...base, fingerprint: hash(base) }; });
  const base: Omit<MemoryEntityEvent, "fingerprint"> = { schemaVersion: "memory-entity-event.v1", eventId: `memory-entity-event-${crypto.randomUUID()}`, eventType: "split", entity: source, replacementEntityIds: replacements.map((entity) => entity.entityId).sort(), evidenceRefs: [...new Set(input.evidenceRefs)].sort(), reason: input.reason, createdAt: now };
  return { entities: [source, ...replacements], events: [{ ...base, fingerprint: hash(base) }] };
}

async function persistArray<T extends { fingerprint: string }>(root: string, relativePath: string, eventPath: string, value: T, event: unknown, identity: (item: T) => boolean, replaceExisting = false): Promise<{ created: boolean; value: T }> {
  const target = resolveInside(root, relativePath);
  let values: T[] = [];
  try { const parsed = JSON.parse(await fs.readFile(target, "utf8")) as T[]; values = Array.isArray(parsed) ? parsed : []; } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; }
  const existing = values.find(identity);
  if (existing) {
    if (existing.fingerprint === value.fingerprint) return { created: false, value: existing };
    if (!replaceExisting) throw new Error("MEMORY_ENTITY_IMMUTABLE");
    values = values.map((item) => identity(item) ? value : item);
  } else values = [...values, value];
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(resolveInside(root, eventPath), `${JSON.stringify(event)}\n`, "utf8");
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(values.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)), null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, value };
}

export async function persistMemoryEntity(root: string, entity: MemoryEntityIdentity, eventType: "created" | "updated" | "merged" | "split" = "created", metadata: Pick<MemoryEntityEvent, "relatedEntityIds" | "replacementEntityIds" | "evidenceRefs" | "reason"> = {}): Promise<{ created: boolean; entity: MemoryEntityIdentity }> {
  assertMemoryEntityIdentityIntegrity(entity);
  const eventBase = { schemaVersion: "memory-entity-event.v1" as const, eventId: `memory-entity-event-${crypto.randomUUID()}`, eventType, entity, createdAt: new Date().toISOString() };
  const event = { ...eventBase, ...metadata, fingerprint: hash({ ...eventBase, ...metadata }) };
  assertMemoryEntityEventIntegrity(event);
  const result = await persistArray(root, "memory/entities/current.json", "memory/entities/events.jsonl", entity, event, (item) => item.entityId === entity.entityId, eventType !== "created");
  return { created: result.created, entity: result.value };
}
export async function listMemoryEntities(root: string): Promise<MemoryEntityIdentity[]> {
  try { const values = JSON.parse(await fs.readFile(resolveInside(root, "memory/entities/current.json"), "utf8")) as MemoryEntityIdentity[]; if (!Array.isArray(values)) throw new Error("MEMORY_ENTITY_INTEGRITY_FAILED"); values.forEach(assertMemoryEntityIdentityIntegrity); return values; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
}
export async function replayPersistedMemoryEntities(root: string): Promise<MemoryEntityReplay> {
  try {
    const content = await fs.readFile(resolveInside(root, "memory/entities/events.jsonl"), "utf8");
    const events = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => assertMemoryEntityEventIntegrity(JSON.parse(line) as MemoryEntityEvent));
    return replayMemoryEntityEvents(events);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return replayMemoryEntityEvents([]);
    throw error;
  }
}
export async function persistAliasAssertion(root: string, assertion: AliasAssertion, eventType: "created" | "confirmed" | "revoked" = "created"): Promise<{ created: boolean; assertion: AliasAssertion }> {
  assertAliasAssertionIntegrity(assertion);
  const eventBase = { schemaVersion: "alias-assertion-event.v1" as const, eventId: `alias-assertion-event-${crypto.randomUUID()}`, eventType, assertion, createdAt: new Date().toISOString() };
  const event = { ...eventBase, fingerprint: hash(eventBase) };
  assertAliasAssertionEventIntegrity(event);
  const result = await persistArray(root, "memory/aliases/current.json", "memory/aliases/events.jsonl", assertion, event, (item) => item.assertionId === assertion.assertionId, eventType !== "created");
  return { created: result.created, assertion: result.value };
}
export async function listAliasAssertions(root: string): Promise<AliasAssertion[]> {
  try { const values = JSON.parse(await fs.readFile(resolveInside(root, "memory/aliases/current.json"), "utf8")) as AliasAssertion[]; if (!Array.isArray(values)) throw new Error("ALIAS_ASSERTION_INTEGRITY_FAILED"); values.forEach(assertAliasAssertionIntegrity); return values; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
}
