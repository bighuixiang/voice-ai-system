import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildCapabilityBaseline } from "./capabilityBaseline.js";
import { getNovelsRoot } from "./workspace.js";
import { resolveInside } from "./pathSafety.js";
import type { NovelProject } from "./types.js";

function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === value.fingerprint;
}

export interface ProjectInventoryEntry {
  projectSlug: string;
  classification: "managed" | "unmanaged" | "invalid";
  governanceState: "legacy" | "migration-preview" | "migration-validated" | "governed" | "migration-activation-incomplete" | "migration-activated";
  fileCount: number;
  sourceConflicts: string[];
  baselineStatus?: "current" | "degraded";
  failures?: Array<{ code: string; path: string }>;
}

export interface ProjectInventory {
  schemaVersion: "project-inventory.v1";
  mode: "read-only";
  generatedAt: string;
  writeAuthorities: [];
  projects: ProjectInventoryEntry[];
  failures: Array<{ code: string; path: string }>;
}

async function countFiles(root: string, current = ""): Promise<number> {
  const absolute = current ? resolveInside(root, current) : root;
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const relative = current ? path.posix.join(current, entry.name) : entry.name;
    if (entry.isDirectory()) count += await countFiles(root, relative);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function existingPaths(root: string, candidates: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const relativePath of candidates) {
    try {
      await fs.access(resolveInside(root, relativePath));
      existing.push(relativePath);
    } catch {
      // A missing conflict marker is expected and does not make the inventory fail.
    }
  }
  return existing;
}

async function governanceState(root: string, project: NovelProject): Promise<ProjectInventoryEntry["governanceState"]> {
  const migration = (project as NovelProject & { migration?: { state?: string } }).migration;
  const projectMigrationId = migration?.state === "activated" && typeof (migration as { migrationId?: unknown }).migrationId === "string"
    ? (migration as { migrationId: string }).migrationId
    : undefined;
  const directory = resolveInside(root, "sessions/migrations");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const rolledBackMigrationIds = new Set<string>();
  for (const name of names.filter((candidate) => candidate.endsWith(".rollback.json"))) {
    try {
      const rollback = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { migrationId?: string; projectSlug?: string; status?: string };
      if (rollback.projectSlug === project.slug && rollback.status === "rolled_back" && typeof rollback.migrationId === "string" && hasValidFingerprint(rollback)) {
        rolledBackMigrationIds.add(rollback.migrationId);
      }
    } catch {
      // Ignore malformed rollback records; a valid activation remains authoritative.
    }
  }
  for (const name of names.filter((candidate) => candidate.endsWith(".activation.json"))) {
    try {
      const activation = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { projectSlug?: string; status?: string };
      const migrationId = typeof activation.migrationId === "string" ? activation.migrationId : "";
      if (activation.schemaVersion === "project-migration-activation.v1" && activation.projectSlug === project.slug && activation.status === "activated" && activation.writeAuthority === "prose-adoption" && hasValidFingerprint(activation) && !rolledBackMigrationIds.has(migrationId) && projectMigrationId === migrationId) return "migration-activated";
    } catch {
      // Ignore malformed or unrelated artifacts; the project remains governed by its own manifest/state.
    }
  }
  if (migration?.state === "activated") return "migration-activation-incomplete";
  if ((project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion?.versionId) return "governed";
  for (const name of names.filter((candidate) => candidate.endsWith(".validation.json"))) {
    try {
      const validation = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { projectSlug?: string; status?: string };
      if (validation.projectSlug === project.slug && validation.status === "validated" && hasValidFingerprint(validation)) return "migration-validated";
    } catch {
      // Ignore malformed or unrelated artifacts; the project remains in its manifest-derived state.
    }
  }
  for (const name of names.filter((candidate) => candidate.startsWith("migration-preview-") && candidate.endsWith(".json"))) {
    try {
      const preview = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { projectSlug?: string; status?: string };
      if (preview.projectSlug === project.slug && preview.status === "preview_only" && hasValidFingerprint(preview)) return "migration-preview";
    } catch {
      // Ignore malformed or unrelated artifacts.
    }
  }
  return "legacy";
}

export async function buildProjectInventory(): Promise<ProjectInventory> {
  const root = getNovelsRoot();
  const projects: ProjectInventoryEntry[] = [];
  const failures: Array<{ code: string; path: string }> = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        schemaVersion: "project-inventory.v1",
        mode: "read-only",
        generatedAt: new Date().toISOString(),
        writeAuthorities: [],
        projects: [],
        failures: []
      };
    }
    throw error;
  }

  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const projectSlug = entry.name;
    const projectRoot = path.join(root, projectSlug);
    const fileCount = await countFiles(projectRoot);
    const sourceConflicts = await existingPaths(projectRoot, ["project.yaml", "project.yml", "metadata.json"]);
    let rawProject: NovelProject;
    try {
      rawProject = JSON.parse(await fs.readFile(path.join(projectRoot, "project.json"), "utf8")) as NovelProject;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing-project-manifest" : "invalid-project-manifest";
      projects.push({ projectSlug, classification: code === "missing-project-manifest" ? "unmanaged" : "invalid", governanceState: "legacy", fileCount, sourceConflicts });
      if (code === "invalid-project-manifest") failures.push({ code, path: `${projectSlug}/project.json` });
      continue;
    }

    if (!rawProject || typeof rawProject !== "object" || rawProject.slug !== projectSlug || !Array.isArray(rawProject.chapters)) {
      projects.push({ projectSlug, classification: "invalid", governanceState: "legacy", fileCount, sourceConflicts });
      failures.push({ code: "invalid-project-manifest", path: `${projectSlug}/project.json` });
      continue;
    }

    try {
      const baseline = await buildCapabilityBaseline(projectRoot, rawProject);
      projects.push({
        projectSlug,
        classification: "managed",
        governanceState: await governanceState(projectRoot, rawProject),
        fileCount,
        sourceConflicts,
        baselineStatus: baseline.freshness.status,
        failures: baseline.failures
      });
    } catch {
      projects.push({ projectSlug, classification: "invalid", governanceState: "legacy", fileCount, sourceConflicts });
      failures.push({ code: "baseline-read-failed", path: `${projectSlug}/project.json` });
    }
  }

  return {
    schemaVersion: "project-inventory.v1",
    mode: "read-only",
    generatedAt: new Date().toISOString(),
    writeAuthorities: [],
    projects,
    failures
  };
}
