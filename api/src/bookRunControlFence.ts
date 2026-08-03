import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

type ControlRun = { projectSlug?: string; scope?: { chapterIds?: string[] }; status?: string };

/** Dispatch fence: paused/pausing/stopping/stopped runs do not admit new work for their frozen chapters. */
export async function chapterDispatchFence(root: string, projectSlug: string, chapterId: string): Promise<{ allowed: boolean; blockedBy?: string }> {
  const directory = resolveInside(root, "sessions/book-runs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.endsWith(".json") && !entry.endsWith(".events.jsonl"))) {
    let run: ControlRun;
    try { run = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as ControlRun; } catch { continue; }
    if (run.projectSlug !== projectSlug || !run.scope?.chapterIds?.includes(chapterId)) continue;
    if (["pausing", "paused", "stopping", "stopped"].includes(run.status || "")) return { allowed: false, blockedBy: run.status };
  }
  return { allowed: true };
}
