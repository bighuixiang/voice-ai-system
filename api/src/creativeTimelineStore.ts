import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { assertCreativeTimelineProjectionIntegrity, type CreativeTimelineProjection } from "./creativeTimeline.js";

function timelinePath(root: string): string { return resolveInside(root, "sessions/creative-timeline.json"); }
const locks = new Map<string, Promise<void>>();
async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> { const previous = locks.get(root) || Promise.resolve(); let release!: () => void; const current = new Promise<void>((resolve) => { release = resolve; }); locks.set(root, current); await previous; try { return await operation(); } finally { release(); if (locks.get(root) === current) locks.delete(root); } }

export async function persistCreativeTimelineProjection(root: string, timeline: CreativeTimelineProjection): Promise<CreativeTimelineProjection> {
  assertCreativeTimelineProjectionIntegrity(timeline);
  return withLock(root, async () => { const target = timelinePath(root); await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(timeline, null, 2)}\n`, "utf8"); await fs.rename(temp, target); return timeline; });
}

export async function readCreativeTimelineProjection(root: string, projectSlug: string): Promise<CreativeTimelineProjection | null> {
  try { return assertCreativeTimelineProjectionIntegrity(JSON.parse(await fs.readFile(timelinePath(root), "utf8")) as CreativeTimelineProjection, projectSlug); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
