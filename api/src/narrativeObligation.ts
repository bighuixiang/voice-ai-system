import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type ObligationType = "mystery" | "prophecy" | "object" | "character_promise" | "relationship_debt" | "emotional_debt" | "rule_exception" | "secret" | "false_clue" | "goal" | "sequel_hook" | "general_foreshadowing";
export type ObligationStatus = "proposed" | "confirmed" | "planned" | "setup" | "reminder" | "escalated" | "partially_paid" | "paid" | "neutralized" | "transformed" | "waived" | "opened" | "invalidated" | "reanchored" | "merged" | "split";

export interface NarrativeObligation {
  schemaVersion: "narrative-obligation.v1";
  obligationId: string;
  projectSlug: string;
  type: ObligationType;
  title: string;
  questionOrPromise: string;
  importance: "low" | "medium" | "high";
  status: ObligationStatus;
  sourceRefs: string[];
  entityRefs: string[];
  decisionConsumptionReceiptRef?: string;
  version: number;
  updatedAt: string;
  fingerprint: string;
}

export interface ObligationEvent {
  schemaVersion: "obligation-event.v1";
  eventId: string;
  obligationId: string;
  fromStatus: ObligationStatus;
  toStatus: ObligationStatus;
  evidenceRefs: string[];
  reason: string;
  actor: "author" | "system" | "migration";
  expectedVersion: number;
  createdAt: string;
  fingerprint: string;
}

interface CreateInput { projectSlug: string; type: ObligationType; title: string; questionOrPromise: string; importance?: "low" | "medium" | "high"; sourceRefs?: string[]; entityRefs?: string[]; decisionConsumptionReceiptRef?: string; }

const transitions: Record<ObligationStatus, ObligationStatus[]> = {
  proposed: ["confirmed", "invalidated"], confirmed: ["planned", "invalidated"], planned: ["setup", "invalidated"], setup: ["reminder", "partially_paid", "paid", "invalidated"], reminder: ["escalated", "partially_paid", "paid", "invalidated"], escalated: ["partially_paid", "paid", "invalidated"], partially_paid: ["reminder", "paid", "transformed", "invalidated"], paid: ["reanchored", "transformed", "invalidated"], neutralized: ["reanchored", "transformed"], transformed: ["reanchored", "invalidated"], waived: [], opened: ["confirmed", "invalidated"], invalidated: [], reanchored: ["setup", "reminder", "partially_paid", "paid", "invalidated"], merged: [], split: []
};

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const obligationTypes: ObligationType[] = ["mystery", "prophecy", "object", "character_promise", "relationship_debt", "emotional_debt", "rule_exception", "secret", "false_clue", "goal", "sequel_hook", "general_foreshadowing"];
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validRefs(value: unknown): value is string[] { return Array.isArray(value) && value.every(nonEmpty); }
function verifyObligationSemantics(obligation: NarrativeObligation): boolean {
  return obligation.schemaVersion === "narrative-obligation.v1" && [obligation.obligationId, obligation.projectSlug, obligation.title, obligation.questionOrPromise, obligation.updatedAt].every(nonEmpty) && (obligation.decisionConsumptionReceiptRef === undefined || nonEmpty(obligation.decisionConsumptionReceiptRef)) && obligationTypes.includes(obligation.type) && ["low", "medium", "high"].includes(obligation.importance) && Object.prototype.hasOwnProperty.call(transitions, obligation.status) && validRefs(obligation.sourceRefs) && validRefs(obligation.entityRefs) && Number.isInteger(obligation.version) && obligation.version >= 0 && Number.isFinite(Date.parse(obligation.updatedAt)) && /^[a-f0-9]{64}$/i.test(obligation.fingerprint);
}
function verifyEvent(event: ObligationEvent): boolean {
  const payoffEvidenceValid = event.toStatus !== "paid" || (Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0 && event.evidenceRefs.every(isTraceableEvidenceReference));
  return event.schemaVersion === "obligation-event.v1" && [event.eventId, event.obligationId, event.reason, event.createdAt].every(nonEmpty) && Object.prototype.hasOwnProperty.call(transitions, event.fromStatus) && transitions[event.fromStatus].includes(event.toStatus) && validRefs(event.evidenceRefs) && payoffEvidenceValid && ["author", "system", "migration"].includes(event.actor) && Number.isInteger(event.expectedVersion) && event.expectedVersion >= 0 && Number.isFinite(Date.parse(event.createdAt)) && /^[a-f0-9]{64}$/i.test(event.fingerprint) && hash((() => { const { fingerprint: _fingerprint, ...base } = event; return base; })()) === event.fingerprint;
}
function isTraceableEvidenceReference(reference: string): boolean { return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(reference.trim()); }
function hasTypeSpecificPayoffEvidence(type: ObligationType, references: string[]): boolean {
  const requiredPrefixes: Partial<Record<ObligationType, string[]>> = {
    object: ["function://", "origin://"],
    character_promise: ["fulfillment://", "consequence://"],
    emotional_debt: ["reaction://", "transformation://"]
  };
  const prefixes = requiredPrefixes[type];
  return !prefixes || references.some((reference) => prefixes.some((prefix) => reference.startsWith(prefix)));
}
function obligationPath(root: string, id: string): string { return resolveInside(root, `sessions/obligations/${id}.json`); }
function eventsPath(root: string, id: string): string { return resolveInside(root, `sessions/obligations/${id}.events.jsonl`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readEvents(root: string, id: string): Promise<ObligationEvent[]> { try { const lines = (await fs.readFile(eventsPath(root, id), "utf8")).split(/\r?\n/).filter(Boolean); return lines.map((line) => JSON.parse(line) as ObligationEvent); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } }

export async function createNarrativeObligation(root: string, input: CreateInput): Promise<NarrativeObligation> {
  if (!input.title.trim() || !input.questionOrPromise.trim()) throw new Error("OBLIGATION_CONTENT_REQUIRED");
  const base = { schemaVersion: "narrative-obligation.v1" as const, obligationId: `obligation-${crypto.randomUUID()}`, projectSlug: input.projectSlug, type: input.type, title: input.title.trim(), questionOrPromise: input.questionOrPromise.trim(), importance: input.importance || "medium", status: "proposed" as const, sourceRefs: [...(input.sourceRefs || [])], entityRefs: [...(input.entityRefs || [])], ...(input.decisionConsumptionReceiptRef?.trim() ? { decisionConsumptionReceiptRef: input.decisionConsumptionReceiptRef.trim() } : {}), version: 0, updatedAt: new Date().toISOString() };
  const obligation: NarrativeObligation = { ...base, fingerprint: hash(base) };
  await writeJson(obligationPath(root, obligation.obligationId), obligation);
  return obligation;
}

export async function readNarrativeObligation(root: string, id: string): Promise<NarrativeObligation | null> {
  let stored: NarrativeObligation;
  try { stored = JSON.parse(await fs.readFile(obligationPath(root, id), "utf8")) as NarrativeObligation; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
  const events = await readEvents(root, id);
  if (events.length === 0) {
    const { fingerprint: _fingerprint, ...base } = stored;
    if (!verifyObligationSemantics(stored)) throw new Error("OBLIGATION_SEMANTIC_INVALID");
    if (hash(base) !== stored.fingerprint) throw new Error("OBLIGATION_INTEGRITY_FAILED");
    return stored;
  }
  let status = events[0].fromStatus;
  let version = events[0].expectedVersion;
  for (const event of events) {
    if (!verifyEvent(event) || event.obligationId !== id || event.fromStatus !== status || event.expectedVersion !== version) throw new Error("OBLIGATION_EVENT_LOG_CORRUPT");
    status = event.toStatus;
    version += 1;
  }
  if (stored.status === status && stored.version === version) {
    const { fingerprint: _fingerprint, ...base } = stored;
    if (!verifyObligationSemantics(stored)) throw new Error("OBLIGATION_SEMANTIC_INVALID");
    if (hash(base) !== stored.fingerprint) throw new Error("OBLIGATION_INTEGRITY_FAILED");
    return stored;
  }
  const { fingerprint: _storedFingerprint, ...storedBase } = stored;
  const repairedBase = { ...storedBase, status, version, updatedAt: events[events.length - 1].createdAt };
  return { ...repairedBase, fingerprint: hash(repairedBase) };
}

export async function appendObligationEvent(root: string, id: string, input: { toStatus: ObligationStatus; evidenceRefs?: string[]; reason: string; actor: ObligationEvent["actor"]; expectedVersion: number }): Promise<{ obligation: NarrativeObligation; event: ObligationEvent }> {
  const current = await readNarrativeObligation(root, id);
  if (!current) throw new Error("OBLIGATION_NOT_FOUND");
  if (current.version !== input.expectedVersion) throw new Error("OBLIGATION_VERSION_CONFLICT");
  if (!input.reason.trim()) throw new Error("OBLIGATION_EVENT_REASON_REQUIRED");
  if (!transitions[current.status].includes(input.toStatus)) throw new Error(`OBLIGATION_INVALID_TRANSITION:${current.status}->${input.toStatus}`);
  if (input.toStatus === "paid" && (!input.evidenceRefs || input.evidenceRefs.length === 0)) throw new Error("OBLIGATION_PAYOFF_EVIDENCE_REQUIRED");
  if (input.toStatus === "paid" && input.evidenceRefs?.some((reference) => !isTraceableEvidenceReference(reference))) throw new Error("OBLIGATION_PAYOFF_EVIDENCE_INVALID");
  if (input.toStatus === "paid" && input.evidenceRefs && !hasTypeSpecificPayoffEvidence(current.type, input.evidenceRefs)) throw new Error("OBLIGATION_PAYOFF_SEMANTIC_EVIDENCE_REQUIRED");
  const eventBase = { schemaVersion: "obligation-event.v1" as const, eventId: `obligation-event-${crypto.randomUUID()}`, obligationId: id, fromStatus: current.status, toStatus: input.toStatus, evidenceRefs: [...(input.evidenceRefs || [])], reason: input.reason.trim(), actor: input.actor, expectedVersion: input.expectedVersion, createdAt: new Date().toISOString() };
  const event: ObligationEvent = { ...eventBase, fingerprint: hash(eventBase) };
  await fs.mkdir(path.dirname(eventsPath(root, id)), { recursive: true });
  await fs.appendFile(eventsPath(root, id), `${JSON.stringify(event)}\n`, "utf8");
  const { fingerprint: _currentFingerprint, ...currentBase } = current;
  const nextBase = { ...currentBase, status: input.toStatus, version: current.version + 1, updatedAt: event.createdAt };
  const next: NarrativeObligation = { ...nextBase, fingerprint: hash(nextBase) };
  await writeJson(obligationPath(root, id), next);
  return { obligation: next, event };
}

export async function listNarrativeObligations(root: string): Promise<NarrativeObligation[]> { const dir = resolveInside(root, "sessions/obligations"); let names: string[]; try { names = await fs.readdir(dir); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } return (await Promise.all(names.filter((name) => name.endsWith(".json") && !name.endsWith(".events.jsonl") && name !== "coverage-certificate.json").map((name) => readNarrativeObligation(root, name.slice(0, -5))))).filter((item): item is NarrativeObligation => Boolean(item)); }
