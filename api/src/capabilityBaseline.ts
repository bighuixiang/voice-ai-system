import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { databaseInfo } from "./database.js";

export type CapabilityBaselineStatus = "current" | "degraded";

export interface CapabilityBaselineFailure {
  code: "missing-support-file" | "unreadable-support-file";
  path: string;
}

export interface CapabilityBaseline {
  schemaVersion: "capability-baseline.v1";
  projectSlug: string;
  mode: "read-only";
  sourceFingerprint: string;
  freshness: { status: CapabilityBaselineStatus };
  writeAuthorities: [];
  environment: {
    schemaVersion: "runtime-capabilities.v1";
    runtime: "node";
    runtimeVersion: string;
    platform: NodeJS.Platform;
    architecture: string;
    persistence: { engine: "node:sqlite" | "json-fallback"; available: boolean };
  };
  capabilities: Array<{
    key: "novel.project.read" | "novel.audit-report.read" | "runtime.environment.read";
    status: "available" | "degraded";
    mode: "read-only";
  }>;
  failures: CapabilityBaselineFailure[];
}

async function collectFiles(root: string, current = ""): Promise<string[]> {
  const absolute = current ? resolveInside(root, current) : root;
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = current ? path.posix.join(current, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relative)));
    } else if (entry.isFile()) {
      files.push(relative.replace(/\\/g, "/"));
    }
  }
  return files;
}

async function fingerprint(root: string, files: string[], failures: CapabilityBaselineFailure[]): Promise<string> {
  const hash = crypto.createHash("sha256");
  for (const relativePath of [...files].sort()) {
    hash.update(relativePath);
    hash.update("\\0");
    hash.update(await fs.readFile(resolveInside(root, relativePath)));
    hash.update("\\0");
  }
  for (const failure of failures) {
    hash.update(`failure:${failure.code}:${failure.path}\\0`);
  }
  return hash.digest("hex");
}

export async function buildCapabilityBaseline(root: string, project: NovelProject): Promise<CapabilityBaseline> {
  const expectedSupportFiles = [
    "project.json",
    "story-control/story-control.json",
    ...project.chapters.flatMap((chapter) => [chapter.outlinePath, chapter.contentPath])
  ];
  const failures: CapabilityBaselineFailure[] = [];
  for (const relativePath of expectedSupportFiles) {
    try {
      await fs.access(resolveInside(root, relativePath));
    } catch {
      failures.push({ code: "missing-support-file", path: relativePath });
    }
  }

  const files = await collectFiles(root);
  const sourceFingerprint = await fingerprint(root, files, failures);
  const status: CapabilityBaselineStatus = failures.length > 0 ? "degraded" : "current";
  const persistence = databaseInfo();
  return {
    schemaVersion: "capability-baseline.v1",
    projectSlug: project.slug,
    mode: "read-only",
    sourceFingerprint,
    freshness: { status },
    writeAuthorities: [],
    environment: {
      schemaVersion: "runtime-capabilities.v1",
      runtime: "node",
      runtimeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      persistence: { engine: persistence.engine, available: persistence.engine === "node:sqlite" || persistence.exists }
    },
    capabilities: [
      { key: "novel.project.read", status: "available", mode: "read-only" },
      { key: "novel.audit-report.read", status: "available", mode: "read-only" },
      { key: "runtime.environment.read", status: "available", mode: "read-only" }
    ],
    failures
  };
}
