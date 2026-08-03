import crypto from "node:crypto";
import fs from "node:fs/promises";
import { resolveInside } from "./pathSafety.js";

export interface TaskContextSourceMatch {
  refs: string[];
  version: string;
}

const fileHash = (content: string): string => crypto.createHash("sha256").update(content, "utf8").digest("hex");

export function sourceVersionFor(relativePath: string, content: string): string {
  if (relativePath === "project.json") {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      delete parsed.updatedAt;
      return fileHash(JSON.stringify(parsed));
    } catch {
      // Fall back to bytes when the source is not valid JSON.
    }
  }
  return fileHash(content);
}

function matchesBlock(blockContent: string, sourceContent: string): boolean {
  if (blockContent === sourceContent) return true;
  if (blockContent.length < 40 || sourceContent.length < blockContent.length) return false;
  const prefix = blockContent.slice(0, Math.min(32, Math.floor(blockContent.length / 3))).trim();
  const suffix = blockContent.slice(-Math.min(32, Math.floor(blockContent.length / 3))).trim();
  return prefix.length >= 12 && suffix.length >= 12 && sourceContent.includes(prefix) && sourceContent.includes(suffix);
}

export async function resolveTaskContextSources(
  root: string,
  blocks: Array<{ title: string; content: string }>,
  sourcePaths: string[]
): Promise<Record<string, TaskContextSourceMatch>> {
  const sources: Array<{ relativePath: string; content: string; version: string }> = [];
  for (const relativePath of [...new Set(sourcePaths.map((item) => item.replace(/\\/g, "/").replace(/^\/+/, "")))]) {
    try {
      const content = await fs.readFile(resolveInside(root, relativePath), "utf8");
      sources.push({ relativePath, content, version: sourceVersionFor(relativePath, content) });
    } catch {
      // Missing optional source is not itself a task failure.
    }
  }
  const result: Record<string, TaskContextSourceMatch> = {};
  for (const block of blocks) {
    const match = sources.find((source) => matchesBlock(block.content, source.content));
    if (match) result[block.title] = { refs: [match.relativePath], version: match.version };
  }
  return result;
}
