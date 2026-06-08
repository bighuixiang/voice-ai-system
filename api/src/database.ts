import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type {
  ExpertRole,
  PlatformAsset,
  PlatformLibrary,
  PromptPreset,
  SkillEntry,
  NovelProject
} from "./types.js";
import { getDatabasePath } from "./workspace.js";

const require = createRequire(import.meta.url);
const DatabaseSync = loadDatabaseSync();

interface JsonDatabaseState {
  projects: Record<string, { projectRoot: string; project: NovelProject }>;
  library?: PlatformLibrary;
}

function loadDatabaseSync(): (new (path: string) => DatabaseSyncType) | null {
  try {
    return (require("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSyncType }).DatabaseSync;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ERR_UNKNOWN_BUILTIN_MODULE") {
      return null;
    }
    throw error;
  }
}

function json<T>(value: T): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: unknown): boolean {
  return Number(value) === 1;
}

export function openDatabase(): DatabaseSyncType {
  if (!DatabaseSync) {
    throw new Error("node:sqlite is not available in this Node.js runtime");
  }
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  migrateDatabase(database);
  return database;
}

export function migrateDatabase(database = openDatabase()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      rough_idea TEXT NOT NULL,
      project_root TEXT NOT NULL,
      project_json TEXT NOT NULL,
      last_opened_chapter_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      project_slug TEXT,
      source_project_slug TEXT,
      file_path TEXT,
      tags_json TEXT NOT NULL,
      related_novel_items_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_project_links (
      asset_id TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (asset_id, project_slug),
      FOREIGN KEY (asset_id) REFERENCES platform_assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_presets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      role_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      is_system INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      default_prompt_ids_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL,
      description TEXT NOT NULL,
      path TEXT,
      tags_json TEXT NOT NULL,
      enabled INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON platform_assets(type);
    CREATE INDEX IF NOT EXISTS idx_asset_links_project ON asset_project_links(project_slug);
  `);
}

export function databaseInfo(): { path: string; exists: boolean; engine: "node:sqlite" | "json-fallback" } {
  const dbPath = getDatabasePath();
  const fallbackPath = jsonDatabasePath();
  return {
    path: DatabaseSync ? dbPath : fallbackPath,
    exists: fs.existsSync(dbPath) || fs.existsSync(fallbackPath),
    engine: DatabaseSync ? "node:sqlite" : "json-fallback"
  };
}

export function upsertProjectRecord(project: NovelProject, projectRoot: string): void {
  if (!DatabaseSync) {
    const state = readJsonDatabase();
    state.projects[project.slug] = { projectRoot, project };
    writeJsonDatabase(state);
    return;
  }

  const database = openDatabase();
  try {
    database
      .prepare(
        `
        INSERT INTO projects (
          slug, title, genre, rough_idea, project_root, project_json, last_opened_chapter_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          genre = excluded.genre,
          rough_idea = excluded.rough_idea,
          project_root = excluded.project_root,
          project_json = excluded.project_json,
          last_opened_chapter_id = excluded.last_opened_chapter_id,
          updated_at = excluded.updated_at
      `
      )
      .run(
        project.slug,
        project.title,
        project.genre,
        project.roughIdea,
        projectRoot,
        json(project),
        project.lastOpenedChapterId,
        project.createdAt,
        project.updatedAt
      );
  } finally {
    database.close();
  }
}

export function listProjectRecords(): NovelProject[] {
  if (!DatabaseSync) {
    return Object.values(readJsonDatabase().projects)
      .map((record) => record.project)
      .sort((left, right) => {
        const updated = right.updatedAt.localeCompare(left.updatedAt);
        return updated || right.createdAt.localeCompare(left.createdAt);
      });
  }

  const database = openDatabase();
  try {
    return database
      .prepare("SELECT project_json FROM projects ORDER BY updated_at DESC, created_at DESC")
      .all()
      .map((row) => parseJson<NovelProject>(row.project_json, null as unknown as NovelProject))
      .filter(Boolean);
  } finally {
    database.close();
  }
}

export function deleteProjectRecord(slug: string): void {
  if (!DatabaseSync) {
    const state = readJsonDatabase();
    delete state.projects[slug];
    writeJsonDatabase(state);
    return;
  }

  const database = openDatabase();
  try {
    database.prepare("DELETE FROM projects WHERE slug = ?").run(slug);
  } finally {
    database.close();
  }
}

export function replacePlatformLibrary(library: PlatformLibrary): void {
  if (!DatabaseSync) {
    const state = readJsonDatabase();
    state.library = library;
    writeJsonDatabase(state);
    return;
  }

  const database = openDatabase();
  try {
    database.exec("BEGIN;");
    database.exec("DELETE FROM asset_project_links;");
    database.exec("DELETE FROM platform_assets;");
    database.exec("DELETE FROM prompt_presets;");
    database.exec("DELETE FROM expert_roles;");
    database.exec("DELETE FROM skills;");

    for (const asset of library.assets) {
      upsertPlatformAssetInDatabase(database, asset);
    }
    for (const role of library.roles) {
      upsertExpertRoleInDatabase(database, role);
    }
    for (const prompt of library.prompts) {
      upsertPromptPresetInDatabase(database, prompt);
    }
    for (const skill of library.skills) {
      upsertSkillEntryInDatabase(database, skill);
    }
    database
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('platform_library_updated_at', ?)")
      .run(library.updatedAt);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
}

function upsertPlatformAssetInDatabase(database: DatabaseSyncType, asset: PlatformAsset): void {
  database
    .prepare(
      `
      INSERT INTO platform_assets (
        id, name, type, scope, project_slug, source_project_slug, file_path, tags_json,
        related_novel_items_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        scope = excluded.scope,
        project_slug = excluded.project_slug,
        source_project_slug = excluded.source_project_slug,
        file_path = excluded.file_path,
        tags_json = excluded.tags_json,
        related_novel_items_json = excluded.related_novel_items_json,
        updated_at = excluded.updated_at
    `
    )
    .run(
      asset.id,
      asset.name,
      asset.type,
      asset.scope,
      asset.projectSlug || null,
      asset.sourceProjectSlug || null,
      asset.filePath || null,
      json(asset.tags),
      json(asset.relatedNovelItems),
      asset.createdAt,
      asset.updatedAt
    );

  for (const projectSlug of asset.linkedProjects) {
    database
      .prepare("INSERT OR IGNORE INTO asset_project_links (asset_id, project_slug, created_at) VALUES (?, ?, ?)")
      .run(asset.id, projectSlug, asset.updatedAt);
  }
}

function upsertPromptPresetInDatabase(database: DatabaseSyncType, prompt: PromptPreset): void {
  database
    .prepare(
      `
      INSERT INTO prompt_presets (id, title, category, role_id, prompt, tags_json, is_system)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        role_id = excluded.role_id,
        prompt = excluded.prompt,
        tags_json = excluded.tags_json,
        is_system = excluded.is_system
    `
    )
    .run(prompt.id, prompt.title, prompt.category, prompt.roleId, prompt.prompt, json(prompt.tags), boolToInt(prompt.isSystem));
}

function upsertExpertRoleInDatabase(database: DatabaseSyncType, role: ExpertRole): void {
  database
    .prepare(
      `
      INSERT INTO expert_roles (id, name, domain, system_prompt, default_prompt_ids_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        domain = excluded.domain,
        system_prompt = excluded.system_prompt,
        default_prompt_ids_json = excluded.default_prompt_ids_json
    `
    )
    .run(role.id, role.name, role.domain, role.systemPrompt, json(role.defaultPromptIds));
}

function upsertSkillEntryInDatabase(database: DatabaseSyncType, skill: SkillEntry): void {
  database
    .prepare(
      `
      INSERT INTO skills (id, name, scope, description, path, tags_json, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        scope = excluded.scope,
        description = excluded.description,
        path = excluded.path,
        tags_json = excluded.tags_json,
        enabled = excluded.enabled
    `
    )
    .run(skill.id, skill.name, skill.scope, skill.description, skill.path || null, json(skill.tags), boolToInt(skill.enabled));
}

export function readPlatformLibraryFromDatabase(defaultLibrary: PlatformLibrary): PlatformLibrary {
  if (!DatabaseSync) {
    return readJsonDatabase().library || defaultLibrary;
  }

  const database = openDatabase();
  try {
    const roleRows = database.prepare("SELECT * FROM expert_roles ORDER BY id").all();
    const promptRows = database.prepare("SELECT * FROM prompt_presets ORDER BY id").all();
    const skillRows = database.prepare("SELECT * FROM skills ORDER BY id").all();
    const assetRows = database.prepare("SELECT * FROM platform_assets ORDER BY updated_at DESC, created_at DESC").all();
    const linkedRows = database.prepare("SELECT asset_id, project_slug FROM asset_project_links ORDER BY project_slug").all();
    const updatedAt =
      (database.prepare("SELECT value FROM metadata WHERE key = 'platform_library_updated_at'").get()?.value as string | undefined) ||
      defaultLibrary.updatedAt;

    if (!roleRows.length && !promptRows.length && !skillRows.length && !assetRows.length) {
      return defaultLibrary;
    }

    const linksByAsset = new Map<string, string[]>();
    for (const row of linkedRows) {
      const assetId = String(row.asset_id);
      const items = linksByAsset.get(assetId) || [];
      items.push(String(row.project_slug));
      linksByAsset.set(assetId, items);
    }

    return {
      version: 1,
      assets: assetRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        type: row.type as PlatformAsset["type"],
        scope: row.scope as PlatformAsset["scope"],
        projectSlug: typeof row.project_slug === "string" ? row.project_slug : undefined,
        sourceProjectSlug: typeof row.source_project_slug === "string" ? row.source_project_slug : undefined,
        filePath: typeof row.file_path === "string" ? row.file_path : undefined,
        tags: parseJson<string[]>(row.tags_json, []),
        linkedProjects: linksByAsset.get(String(row.id)) || [],
        relatedNovelItems: parseJson(row.related_novel_items_json, []),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      })),
      prompts: promptRows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        category: row.category as PromptPreset["category"],
        roleId: String(row.role_id),
        prompt: String(row.prompt),
        tags: parseJson<string[]>(row.tags_json, []),
        isSystem: intToBool(row.is_system)
      })),
      roles: roleRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        domain: row.domain as ExpertRole["domain"],
        systemPrompt: String(row.system_prompt),
        defaultPromptIds: parseJson<string[]>(row.default_prompt_ids_json, [])
      })),
      skills: skillRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        scope: row.scope as SkillEntry["scope"],
        description: String(row.description),
        path: typeof row.path === "string" ? row.path : undefined,
        tags: parseJson<string[]>(row.tags_json, []),
        enabled: intToBool(row.enabled)
      })),
      updatedAt
    };
  } finally {
    database.close();
  }
}

export function hasPlatformLibraryData(): boolean {
  if (!DatabaseSync) {
    const library = readJsonDatabase().library;
    return Boolean(library && (library.assets.length || library.prompts.length || library.roles.length || library.skills.length));
  }

  const database = openDatabase();
  try {
    const row = database
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM platform_assets) +
          (SELECT COUNT(*) FROM prompt_presets) +
          (SELECT COUNT(*) FROM expert_roles) +
          (SELECT COUNT(*) FROM skills) AS count
      `
      )
      .get();
    return Number(row?.count || 0) > 0;
  } finally {
    database.close();
  }
}

export function upsertPlatformAsset(asset: PlatformAsset): void {
  if (!DatabaseSync) {
    const state = readJsonDatabase();
    const timestamp = new Date().toISOString();
    const library = state.library || {
      version: 1,
      assets: [],
      prompts: [],
      roles: [],
      skills: [],
      updatedAt: timestamp
    };
    const existingIndex = library.assets.findIndex((item) => item.id === asset.id);
    if (existingIndex >= 0) {
      library.assets[existingIndex] = asset;
    } else {
      library.assets.unshift(asset);
    }
    state.library = { ...library, updatedAt: asset.updatedAt || timestamp };
    writeJsonDatabase(state);
    return;
  }

  const database = openDatabase();
  try {
    upsertPlatformAssetInDatabase(database, asset);
  } finally {
    database.close();
  }
}

function jsonDatabasePath(): string {
  const dbPath = getDatabasePath();
  return dbPath.endsWith(".sqlite") ? dbPath.replace(/\.sqlite$/, ".json") : `${dbPath}.json`;
}

function emptyJsonDatabase(): JsonDatabaseState {
  return { projects: {} };
}

function readJsonDatabase(): JsonDatabaseState {
  const dbPath = jsonDatabasePath();
  if (!fs.existsSync(dbPath)) return emptyJsonDatabase();

  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8")) as Partial<JsonDatabaseState>;
    return {
      projects: parsed.projects || {},
      library: parsed.library
    };
  } catch {
    return emptyJsonDatabase();
  }
}

function writeJsonDatabase(state: JsonDatabaseState): void {
  const dbPath = jsonDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
