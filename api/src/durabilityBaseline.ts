import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { databaseInfo } from "./database.js";
import { buildCapabilityBaseline } from "./capabilityBaseline.js";
import { resolveInside } from "./pathSafety.js";
import type { NovelProject } from "./types.js";

export interface DurabilityBaseline {
  schemaVersion: "durability-baseline.v1";
  projectSlug: string;
  mode: "read-only";
  writeAuthorities: [];
  projectTree: { fileCount: number; fingerprint: string };
  database: { engine: "node:sqlite" | "json-fallback"; available: boolean };
  backup: { status: "not-configured"; strategy: "none" };
  recovery: { status: "not-configured"; settlement: "not-issued" };
  failures: Array<{ code: string; path: string }>;
}

async function collectFilePaths(root: string, current = ""): Promise<string[]> {
  const absolute = current ? resolveInside(root, current) : root;
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = current ? path.posix.join(current, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...(await collectFilePaths(root, relative)));
    else if (entry.isFile()) files.push(relative.replace(/\\/g, "/"));
  }
  return files;
}

async function fingerprint(root: string, files: string[]): Promise<string> {
  const hash = crypto.createHash("sha256");
  for (const relativePath of [...files].sort()) {
    hash.update(relativePath);
    hash.update("\\0");
    hash.update(await fs.readFile(resolveInside(root, relativePath)));
    hash.update("\\0");
  }
  return hash.digest("hex");
}

export async function buildDurabilityBaseline(root: string, project: NovelProject): Promise<DurabilityBaseline> {
  const files = await collectFilePaths(root);
  const baseline = await buildCapabilityBaseline(root, project);
  const persistence = databaseInfo();
  return {
    schemaVersion: "durability-baseline.v1",
    projectSlug: project.slug,
    mode: "read-only",
    writeAuthorities: [],
    projectTree: { fileCount: files.length, fingerprint: await fingerprint(root, files) },
    database: { engine: persistence.engine, available: persistence.engine === "node:sqlite" || persistence.exists },
    backup: { status: "not-configured", strategy: "none" },
    recovery: { status: "not-configured", settlement: "not-issued" },
    failures: baseline.failures
  };
}
