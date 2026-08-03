import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type StoryTimeCategory = "event" | "journey" | "training" | "healing" | "manufacture" | "communication" | "cooldown" | "institutional-response" | "other";
export interface StoryTimeEvent { schemaVersion: "story-time-event.v1"; eventId: string; projectSlug: string; label: string; timelineId: string; category: StoryTimeCategory; start: string; end: string; duration: string; uncertainty: "exact" | "approximate" | "unknown"; parallelLine: string; sourceRefs: string[]; createdAt: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function eventPath(root: string, id: string): string { return resolveInside(root, `sessions/story-time-events/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
export function assertStoryTimeEventIntegrity(event: StoryTimeEvent, expectedId?: string): StoryTimeEvent {
  const { fingerprint, ...base } = event;
  const categories: StoryTimeCategory[] = ["event", "journey", "training", "healing", "manufacture", "communication", "cooldown", "institutional-response", "other"];
  const rangeValid = event.uncertainty === "unknown" ? (!event.start && !event.end || event.start <= event.end) : nonEmpty(event.start) && nonEmpty(event.end) && event.start <= event.end;
  const valid = event.schemaVersion === "story-time-event.v1" && (!expectedId || event.eventId === expectedId) && [event.eventId, event.projectSlug, event.label, event.timelineId, event.duration, event.parallelLine, event.createdAt].every(nonEmpty) && categories.includes(event.category) && ["exact", "approximate", "unknown"].includes(event.uncertainty) && rangeValid && stringArray(event.sourceRefs, true) && Number.isFinite(Date.parse(event.createdAt)) && /^[a-f0-9]{64}$/i.test(event.fingerprint) && hash(base) === event.fingerprint;
  if (!valid) throw new Error("STORY_TIME_INTEGRITY_FAILED");
  return event;
}
export async function readStoryTimeEvent(root: string, eventId: string): Promise<StoryTimeEvent | null> { const event = await readJson<StoryTimeEvent>(eventPath(root, eventId)); return event ? assertStoryTimeEventIntegrity(event, eventId) : null; }
export async function listStoryTimeEvents(root: string, projectSlug: string): Promise<StoryTimeEvent[]> { const directory = resolveInside(root, "sessions/story-time-events"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const record = await readJson<StoryTimeEvent>(path.join(directory, name)); return record ? assertStoryTimeEventIntegrity(record, name.slice(0, -5)) : null; })); return records.filter((record): record is StoryTimeEvent => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createStoryTimeEvent(input: { root: string; projectSlug: string; eventId: string; label: string; timelineId: string; category?: StoryTimeCategory; start: string; end: string; duration: string; uncertainty: StoryTimeEvent["uncertainty"]; parallelLine: string; sourceRefs: readonly string[] }): Promise<StoryTimeEvent> {
  if (!input.projectSlug.trim() || !input.eventId.trim() || !input.label.trim() || !input.timelineId.trim() || !input.duration.trim() || !input.parallelLine.trim()) throw new Error("STORY_TIME_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("STORY_TIME_SOURCE_REQUIRED");
  if (input.uncertainty !== "unknown" && (!input.start.trim() || !input.end.trim())) throw new Error("STORY_TIME_RANGE_REQUIRED");
  if (input.start.trim() && input.end.trim() && input.start > input.end) throw new Error("STORY_TIME_RANGE_INVALID");
  const existing = await readStoryTimeEvent(input.root, input.eventId); if (existing) return existing;
  const base = { schemaVersion: "story-time-event.v1" as const, eventId: input.eventId, projectSlug: input.projectSlug, label: input.label, timelineId: input.timelineId, category: input.category ?? "other" as const, start: input.start, end: input.end, duration: input.duration, uncertainty: input.uncertainty, parallelLine: input.parallelLine, sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const event: StoryTimeEvent = { ...base, fingerprint: hash(base) }; await writeJson(eventPath(input.root, input.eventId), event); return event;
}
export function buildStoryTimeEventOrder(events: readonly StoryTimeEvent[]): Record<string, number> {
  return [...events]
    .filter((event) => event.uncertainty !== "unknown" && Boolean(event.start))
    .sort((left, right) => left.timelineId.localeCompare(right.timelineId) || left.start.localeCompare(right.start) || left.end.localeCompare(right.end) || left.eventId.localeCompare(right.eventId))
    .reduce<Record<string, number>>((order, event, index) => { order[event.eventId] = index; return order; }, {});
}
export function compareStoryTime(left: StoryTimeEvent, right: StoryTimeEvent): "before" | "after" | "simultaneous" | "unknown" { if (left.uncertainty === "unknown" || right.uncertainty === "unknown" || !left.start || !right.start) return "unknown"; if (left.timelineId !== right.timelineId && left.start === right.start) return "simultaneous"; if (left.end < right.start) return "before"; if (left.start > right.end) return "after"; return "simultaneous"; }
