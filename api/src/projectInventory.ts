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
  const migration = (project as NovelProject & { migration?: { state?: string; writeAuthority?: string } }).migration;
  const projectMigrationId = migration?.state === "activated" && typeof (migration as { migrationId?: unknown }).migrationId === "string"
    ? (migration as { migrationId: string }).migrationId
    : undefined;
  const directory = resolveInside(root, "sessions/migrations");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const rolledBackMigrationIds = new Set<string>();
  for (const name of names.filter((candidate) => candidate.endsWith(".rollback.json"))) {
    try {
      const rollback = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { migrationId?: string; projectSlug?: string; status?: string };
      const filenameMigrationId = name.slice(0, -".rollback.json".length);
      if (rollback.projectSlug === project.slug && rollback.status === "rolled_back" && rollback.migrationId === filenameMigrationId && typeof rollback.migrationId === "string" && typeof rollback.activationFingerprint === "string" && /^[a-f0-9]{64}$/i.test(rollback.activationFingerprint) && typeof rollback.rolledBackAt === "string" && Number.isFinite(Date.parse(rollback.rolledBackAt)) && hasValidFingerprint(rollback)) {
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
      const filenameMigrationId = name.slice(0, -".activation.json".length);
      const manifestWriteAuthority = typeof migration?.writeAuthority === "string" ? migration.writeAuthority : undefined;
      if (activation.schemaVersion === "project-migration-activation.v1" && activation.projectSlug === project.slug && activation.status === "activated" && activation.writeAuthority === "prose-adoption" && manifestWriteAuthority === "prose-adoption" && typeof activation.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(activation.sourceFingerprint) && typeof activation.activatedAt === "string" && Number.isFinite(Date.parse(activation.activatedAt)) && hasValidFingerprint(activation) && !rolledBackMigrationIds.has(migrationId) && projectMigrationId === migrationId && filenameMigrationId === migrationId) return "migration-activated";
    } catch {
      // Ignore malformed or unrelated artifacts; the project remains governed by its own manifest/state.
    }
  }
  if (migration?.state === "activated") return "migration-activation-incomplete";
  if ((project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion?.versionId) return "governed";
  for (const name of names.filter((candidate) => candidate.endsWith(".validation.json"))) {
    try {
      const validation = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { projectSlug?: string; status?: string };
      const filenameMigrationId = name.slice(0, -".validation.json".length);
      const validationDependencies = validation.dependencies as { outlineVersion?: unknown } | undefined;
      if (validation.projectSlug === project.slug && validation.status === "validated" && validation.migrationId === filenameMigrationId && Array.isArray(validation.conflicts) && validation.conflicts.every((item) => typeof item === "string") && Array.isArray(validation.resolvedConflicts) && validation.resolvedConflicts.every((item) => typeof item === "string") && (validationDependencies?.outlineVersion === "ready" || validationDependencies?.outlineVersion === "missing") && typeof validation.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(validation.sourceFingerprint) && typeof validation.validatedAt === "string" && Number.isFinite(Date.parse(validation.validatedAt)) && hasValidFingerprint(validation)) return "migration-validated";
    } catch {
      // Ignore malformed or unrelated artifacts; the project remains in its manifest-derived state.
    }
  }
  for (const name of names.filter((candidate) => candidate.startsWith("migration-preview-") && candidate.endsWith(".json"))) {
    try {
      const preview = JSON.parse(await fs.readFile(resolveInside(root, `sessions/migrations/${name}`), "utf8")) as Record<string, unknown> & { projectSlug?: string; status?: string };
      const filenameMigrationId = name.slice(0, -".json".length);
      const assetCounts = preview.assetCounts as Record<string, unknown> | undefined;
      if (preview.projectSlug === project.slug && preview.status === "preview_only" && preview.migrationId === filenameMigrationId && assetCounts !== null && typeof assetCounts === "object" && Object.values(assetCounts).every((count) => Number.isInteger(count) && (count as number) >= 0) && Array.isArray(preview.conflicts) && preview.conflicts.every((item) => typeof item === "string") && typeof preview.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(preview.sourceFingerprint) && typeof preview.createdAt === "string" && Number.isFinite(Date.parse(preview.createdAt)) && hasValidFingerprint(preview)) return "migration-preview";
    } catch {
      // Ignore malformed or unrelated artifacts.
    }
  }
  return "legacy";
}

export async function buildProjectInventory(): Promise<ProjectInventory> {
  const root = getNovelsRoot();
  const reservedDirectories = new Set([process.env.NOVEL_DATA_ROOT, process.env.PLATFORM_ROOT]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value)));
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

  for (const entry of entries.filter((item) => item.isDirectory() && !reservedDirectories.has(path.resolve(root, item.name))).sort((left, right) => left.name.localeCompare(right.name))) {
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
