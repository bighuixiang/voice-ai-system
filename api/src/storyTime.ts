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
export async function readStoryTimeEvent(root: string, eventId: string): Promise<StoryTimeEvent | null> { return readJson<StoryTimeEvent>(eventPath(root, eventId)); }
export async function listStoryTimeEvents(root: string, projectSlug: string): Promise<StoryTimeEvent[]> { const directory = resolveInside(root, "sessions/story-time-events"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<StoryTimeEvent>(path.join(directory, name)))); return records.filter((record): record is StoryTimeEvent => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createStoryTimeEvent(input: { root: string; projectSlug: string; eventId: string; label: string; timelineId: string; category?: StoryTimeCategory; start: string; end: string; duration: string; uncertainty: StoryTimeEvent["uncertainty"]; parallelLine: string; sourceRefs: readonly string[] }): Promise<StoryTimeEvent> {
  if (!input.projectSlug.trim() || !input.eventId.trim() || !input.label.trim() || !input.timelineId.trim() || !input.duration.trim() || !input.parallelLine.trim()) throw new Error("STORY_TIME_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("STORY_TIME_SOURCE_REQUIRED");
  if (input.uncertainty !== "unknown" && (!input.start.trim() || !input.end.trim())) throw new Error("STORY_TIME_RANGE_REQUIRED");
  if (input.start.trim() && input.end.trim() && input.start > input.end) throw new Error("STORY_TIME_RANGE_INVALID");
  const existing = await readStoryTimeEvent(input.root, input.eventId); if (existing) return existing;
  const base = { schemaVersion: "story-time-event.v1" as const, eventId: input.eventId, projectSlug: input.projectSlug, label: input.label, timelineId: input.timelineId, category: input.category ?? "other" as const, start: input.start, end: input.end, duration: input.duration, uncertainty: input.uncertainty, parallelLine: input.parallelLine, sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString() };
  const event: StoryTimeEvent = { ...base, fingerprint: hash(base) }; await writeJson(eventPath(input.root, input.eventId), event); return event;
}
export function compareStoryTime(left: StoryTimeEvent, right: StoryTimeEvent): "before" | "after" | "simultaneous" | "unknown" { if (left.uncertainty === "unknown" || right.uncertainty === "unknown" || !left.start || !right.start) return "unknown"; if (left.timelineId !== right.timelineId && left.start === right.start) return "simultaneous"; if (left.end < right.start) return "before"; if (left.start > right.end) return "after"; return "simultaneous"; }
