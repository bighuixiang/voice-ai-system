import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface MigrationPreview {
  schemaVersion: "project-migration-preview.v1";
  migrationId: string;
  projectSlug: string;
  status: "preview_only";
  previewOnly: true;
  writeAuthority: "legacy_compatibility_only";
  assetCounts: {
    chapters: number;
    outlines: number;
    sceneCards: number;
    summaries: number;
    ledgers: number;
    qualityReports: number;
  };
  conflicts: string[];
  sourceFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return hash(base) === value.fingerprint;
}
function hasValidSemantics(value: MigrationPreview, migrationId: string): boolean {
  const counts = value.assetCounts;
  return value.schemaVersion === "project-migration-preview.v1"
    && value.migrationId === migrationId
    && typeof value.projectSlug === "string" && value.projectSlug.length > 0
    && value.status === "preview_only"
    && value.previewOnly === true
    && value.writeAuthority === "legacy_compatibility_only"
    && counts !== null && typeof counts === "object"
    && Object.values(counts).every((count) => Number.isInteger(count) && count >= 0)
    && Array.isArray(value.conflicts) && value.conflicts.every((conflict) => typeof conflict === "string")
    && typeof value.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.sourceFingerprint)
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt));
}

function previewPath(root: string, migrationId: string): string {
  return resolveInside(root, `sessions/migrations/${migrationId}.json`);
}

async function exists(target: string): Promise<boolean> {
  try { await fs.access(target); return true; } catch { return false; }
}

async function fingerprintTree(root: string, relative: string): Promise<Array<{ path: string; fingerprint: string }>> {
  const target = resolveInside(root, relative);
  let entries;
  try { entries = await fs.readdir(target, { withFileTypes: true }); }
  catch { return []; }
  const fingerprints: Array<{ path: string; fingerprint: string }> = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) fingerprints.push(...await fingerprintTree(root, child));
    else if (entry.isFile()) {
      try { fingerprints.push({ path: child, fingerprint: hash(await fs.readFile(resolveInside(root, child))) }); }
      catch { /* source disappeared during a read-only preview; next preview will retry */ }
    }
  }
  return fingerprints;
}

async function detectSourceConflicts(root: string): Promise<string[]> {
  const outlineRoot = resolveInside(root, "outline");
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(outlineRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const hasMarker = (marker: string) => entries.some((entry) => new RegExp(`(^|[-_. ])${marker}($|[-_. ])`, "i").test(entry));
  const conflicts: string[] = [];
  if (hasMarker("ACTIVE") && hasMarker("ARCHIVED")) conflicts.push("outline-authority-active-and-archived");
  return conflicts;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readMigrationPreview(root: string, migrationId: string): Promise<MigrationPreview | null> {
  try {
    const value = JSON.parse(await fs.readFile(previewPath(root, migrationId), "utf8")) as MigrationPreview;
    if (!hasValidFingerprint(value as unknown as Record<string, unknown>)) throw new Error("MIGRATION_PREVIEW_INTEGRITY_FAILED");
    if (!hasValidSemantics(value, migrationId)) {
      throw new Error("MIGRATION_PREVIEW_SEMANTIC_MISMATCH");
    }
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function previewProjectMigration(root: string, projectSlug: string): Promise<MigrationPreview> {
  const projectFile = await fs.readFile(resolveInside(root, "project.json"), "utf8");
  const project = JSON.parse(projectFile) as {
    chapters?: Array<{ id?: string; contentPath?: string; outlinePath?: string }>;
  };
  const chapters = Array.isArray(project.chapters) ? project.chapters : [];
  const chapterPaths = chapters.map((chapter) => chapter.contentPath || "").filter(Boolean);
  const outlinePaths = chapters.map((chapter) => chapter.outlinePath || "").filter(Boolean);
  const countExisting = async (relativePaths: string[]): Promise<number> => {
    let count = 0;
    for (const relativePath of relativePaths) {
      if (await exists(resolveInside(root, relativePath))) count += 1;
    }
    return count;
  };
  const assetFingerprints = async (relativePaths: string[]): Promise<Array<{ path: string; fingerprint: string }>> => {
    const fingerprints: Array<{ path: string; fingerprint: string }> = [];
    for (const relativePath of relativePaths) {
      try {
        const content = await fs.readFile(resolveInside(root, relativePath));
        fingerprints.push({ path: relativePath, fingerprint: hash(content) });
      } catch {
        // Missing assets remain represented by the existing count and are not fingerprinted.
      }
    }
    return fingerprints;
  };
  const assetCounts = {
    chapters: await countExisting(chapterPaths),
    outlines: await countExisting(outlinePaths),
    sceneCards: await exists(resolveInside(root, "sessions/scene-cards")) ? 1 : 0,
    summaries: await exists(resolveInside(root, "memory/chapter-summaries")) ? 1 : 0,
    ledgers: await exists(resolveInside(root, "ledgers")) ? 1 : 0,
    qualityReports: await exists(resolveInside(root, "quality")) ? 1 : 0
  };
  const conflicts = await detectSourceConflicts(root);
  const source = {
    projectSlug,
    projectFile,
    assetCounts,
    chapterPaths,
    outlinePaths,
    chapterFingerprints: await assetFingerprints(chapterPaths),
    outlineFingerprints: await assetFingerprints(outlinePaths),
    legacyAssetFingerprints: (await Promise.all(["sessions/scene-cards", "memory", "quality", "ledgers", "ledger", "bible"].map((relative) => fingerprintTree(root, relative)))).flat(),
    conflicts
  };
  const sourceFingerprint = hash(source);
  const migrationId = `migration-preview-${sourceFingerprint.slice(0, 24)}`;
  const existing = await readMigrationPreview(root, migrationId);
  if (existing) return existing;
  const base = {
    schemaVersion: "project-migration-preview.v1" as const,
    migrationId,
    projectSlug,
    status: "preview_only" as const,
    previewOnly: true as const,
    writeAuthority: "legacy_compatibility_only" as const,
    assetCounts,
    conflicts,
    sourceFingerprint,
    createdAt: new Date().toISOString()
  };
  const preview: MigrationPreview = { ...base, fingerprint: hash(base) };
  await writeJson(previewPath(root, migrationId), preview);
  return preview;
}
