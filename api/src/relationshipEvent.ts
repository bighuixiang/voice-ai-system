import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCharacterDramaticContract } from "./characterContract.js";
import { readCharacterStateSnapshot, type RelationshipState } from "./characterState.js";

export interface RelationshipEvent {
  schemaVersion: "relationship-event.v1";
  eventId: string;
  projectSlug: string;
  relationshipId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  contractId: string;
  beforeSnapshotId: string;
  sharedEventRef: string;
  sourceCharacterChoice: string;
  targetCharacterChoice: string;
  sourceInterpretation: string;
  targetInterpretation: string;
  visibleActions: string[];
  valueExchange: string;
  immediateCost: string;
  delayedCost: string;
  evidenceRefs: string[];
  status: "planned" | "observed";
  afterSnapshotId?: string;
  outcomeRefs?: string[];
  relationshipBefore?: RelationshipState;
  relationshipAfter?: RelationshipState;
  relationshipChangedDimensions?: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function eventPath(root: string, eventId: string): string { return resolveInside(root, `sessions/relationship-events/${eventId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown, required = true): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
function relationshipStateValid(value: unknown): value is RelationshipState {
  if (!value || typeof value !== "object") return false;
  const state = value as RelationshipState;
  return nonEmpty(state.targetCharacterId) && [state.trust, state.intimacy ?? 0, state.power, state.dependency, state.fear, state.responsibility ?? 0].every((item) => Number.isFinite(item) && item >= 0 && item <= 1) && [state.publicStance, state.privateStance, state.boundary, state.unpaidDebt].every(nonEmpty);
}
export function assertRelationshipEventIntegrity(event: RelationshipEvent, expectedId?: string): RelationshipEvent {
  const { fingerprint, ...base } = event;
  const common = [event.eventId, event.projectSlug, event.relationshipId, event.sourceCharacterId, event.targetCharacterId, event.contractId, event.beforeSnapshotId, event.sharedEventRef, event.sourceCharacterChoice, event.targetCharacterChoice, event.sourceInterpretation, event.targetInterpretation, event.valueExchange, event.immediateCost, event.delayedCost, event.createdAt, event.updatedAt].every(nonEmpty);
  const observed = event.status === "observed" && nonEmpty(event.afterSnapshotId) && stringArray(event.outcomeRefs) && relationshipStateValid(event.relationshipBefore) && relationshipStateValid(event.relationshipAfter) && stringArray(event.relationshipChangedDimensions) && event.relationshipChangedDimensions.length > 0;
  const planned = event.status === "planned" && event.afterSnapshotId === undefined && event.outcomeRefs === undefined && event.relationshipBefore === undefined && event.relationshipAfter === undefined && event.relationshipChangedDimensions === undefined;
  const valid = event.schemaVersion === "relationship-event.v1" && (!expectedId || event.eventId === expectedId) && common && stringArray(event.visibleActions) && stringArray(event.evidenceRefs) && ["planned", "observed"].includes(event.status) && (planned || observed) && Number.isFinite(Date.parse(event.createdAt)) && Number.isFinite(Date.parse(event.updatedAt)) && /^[a-f0-9]{64}$/i.test(event.fingerprint) && hash(base) === event.fingerprint;
  if (!valid) throw new Error("RELATIONSHIP_EVENT_INTEGRITY_FAILED");
  return event;
}

export async function readRelationshipEvent(root: string, eventId: string): Promise<RelationshipEvent | null> { const event = await readJson<RelationshipEvent>(eventPath(root, eventId)); return event ? assertRelationshipEventIntegrity(event, eventId) : null; }

export async function createRelationshipEvent(input: { root: string; projectSlug: string; relationshipId: string; sourceCharacterId: string; targetCharacterId: string; contractId: string; beforeSnapshotId: string; sharedEventRef: string; sourceCharacterChoice: string; targetCharacterChoice: string; sourceInterpretation: string; targetInterpretation: string; visibleActions: readonly string[]; valueExchange: string; immediateCost: string; delayedCost: string; evidenceRefs: readonly string[] }): Promise<RelationshipEvent> {
  const contract = await readCharacterDramaticContract(input.root, input.contractId);
  const before = await readCharacterStateSnapshot(input.root, input.beforeSnapshotId);
  if (!contract || contract.projectSlug !== input.projectSlug || contract.characterId !== input.sourceCharacterId) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (!before || before.projectSlug !== input.projectSlug || before.characterId !== input.sourceCharacterId) throw new Error("CHARACTER_STATE_SNAPSHOT_NOT_FOUND");
  const required = [input.relationshipId, input.targetCharacterId, input.sharedEventRef, input.sourceCharacterChoice, input.targetCharacterChoice, input.sourceInterpretation, input.targetInterpretation, input.immediateCost, input.delayedCost];
  if (!input.valueExchange.trim()) throw new Error("RELATIONSHIP_VALUE_EXCHANGE_REQUIRED");
  if (required.some((value) => !value.trim())) throw new Error("RELATIONSHIP_EVENT_FIELDS_REQUIRED");
  if (!input.visibleActions.length) throw new Error("RELATIONSHIP_VISIBLE_ACTION_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("RELATIONSHIP_EVIDENCE_REQUIRED");
  const eventId = `relationship-event-${input.projectSlug}-${hash({ relationshipId: input.relationshipId, before: input.beforeSnapshotId, sharedEventRef: input.sharedEventRef }).slice(0, 16)}`;
  const existing = await readRelationshipEvent(input.root, eventId);
  if (existing) return existing;
  const base = { schemaVersion: "relationship-event.v1" as const, eventId, projectSlug: input.projectSlug, relationshipId: input.relationshipId, sourceCharacterId: input.sourceCharacterId, targetCharacterId: input.targetCharacterId, contractId: input.contractId, beforeSnapshotId: input.beforeSnapshotId, sharedEventRef: input.sharedEventRef, sourceCharacterChoice: input.sourceCharacterChoice, targetCharacterChoice: input.targetCharacterChoice, sourceInterpretation: input.sourceInterpretation, targetInterpretation: input.targetInterpretation, visibleActions: [...input.visibleActions], valueExchange: input.valueExchange, immediateCost: input.immediateCost, delayedCost: input.delayedCost, evidenceRefs: [...input.evidenceRefs], status: "planned" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const event: RelationshipEvent = { ...base, fingerprint: hash(base) };
  await writeJson(eventPath(input.root, eventId), event);
  return event;
}

export async function observeRelationshipEvent(input: { root: string; eventId: string; afterSnapshotId: string; outcomeRefs: readonly string[] }): Promise<RelationshipEvent> {
  const existing = await readRelationshipEvent(input.root, input.eventId);
  if (!existing) throw new Error("RELATIONSHIP_EVENT_NOT_FOUND");
  if (existing.status === "observed") return existing;
  const after = await readCharacterStateSnapshot(input.root, input.afterSnapshotId);
  const before = await readCharacterStateSnapshot(input.root, existing.beforeSnapshotId);
  if (!after || after.projectSlug !== existing.projectSlug || after.characterId !== existing.sourceCharacterId || !before) throw new Error("CHARACTER_STATE_SNAPSHOT_NOT_FOUND");
  if (!input.outcomeRefs.length) throw new Error("RELATIONSHIP_OUTCOME_REQUIRED");
  const relationshipBefore = before.relationshipStances.find((item) => item.targetCharacterId === existing.targetCharacterId);
  const relationshipAfter = after.relationshipStances.find((item) => item.targetCharacterId === existing.targetCharacterId);
  if (!relationshipBefore || !relationshipAfter) throw new Error("RELATIONSHIP_STATE_REQUIRED");
  const relationshipDimensions = ["trust", "intimacy", "power", "dependency", "fear", "responsibility", "publicStance", "privateStance", "boundary", "unpaidDebt"];
  const relationshipChangedDimensions = relationshipDimensions.filter((dimension) => JSON.stringify(relationshipBefore[dimension as keyof RelationshipState]) !== JSON.stringify(relationshipAfter[dimension as keyof RelationshipState]));
  if (!relationshipChangedDimensions.length) throw new Error("RELATIONSHIP_STATE_CHANGE_REQUIRED");
  const { fingerprint: _oldFingerprint, ...eventWithoutFingerprint } = existing;
  const base = { ...eventWithoutFingerprint, status: "observed" as const, afterSnapshotId: input.afterSnapshotId, outcomeRefs: [...input.outcomeRefs], relationshipBefore, relationshipAfter, relationshipChangedDimensions, updatedAt: new Date().toISOString() };
  const event: RelationshipEvent = { ...base, fingerprint: hash(base) };
  await writeJson(eventPath(input.root, existing.eventId), event);
  return event;
}
