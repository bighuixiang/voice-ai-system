import fs from "node:fs/promises";
import path from "node:path";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import type { EditorSuggestion, EditorSuggestionRequest, FileDiffResult, FileVersionSnapshot, NovelProject } from "./types.js";

interface FileVersionManifest {
  version: 1;
  snapshots: FileVersionSnapshot[];
}

const manifestPath = "versions/manifest.json";

function writingPaths(project: NovelProject): Set<string> {
  return new Set(project.chapters.flatMap((chapter) => [chapter.contentPath, chapter.outlinePath]));
}

export function isVersionedWritingPath(project: NovelProject, relativePath: string): boolean {
  return writingPaths(project).has(relativePath);
}

function snapshotFolderName(relativePath: string): string {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("__")
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "-")
    .slice(0, 160);
}

function snapshotId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readManifest(root: string): Promise<FileVersionManifest> {
  try {
    const raw = await fs.readFile(resolveInside(root, manifestPath), "utf8");
    const parsed = JSON.parse(raw) as Partial<FileVersionManifest>;
    return {
      version: 1,
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : []
    };
  } catch {
    return { version: 1, snapshots: [] };
  }
}

async function writeManifest(root: string, manifest: FileVersionManifest): Promise<void> {
  const target = resolveInside(root, manifestPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function createWritingFileSnapshot(
  root: string,
  project: NovelProject,
  relativePath: string,
  nextContent: string
): Promise<FileVersionSnapshot | null> {
  const safePath = assertSafeNovelPath(relativePath);
  if (!isVersionedWritingPath(project, safePath)) return null;

  const absolutePath = resolveInside(root, safePath);
  const currentContent = await fs.readFile(absolutePath, "utf8").catch(() => "");
  if (currentContent === nextContent) return null;

  const id = snapshotId();
  const createdAt = new Date().toISOString();
  const versionPath = `versions/${snapshotFolderName(safePath)}/${id}.md`;
  const snapshot: FileVersionSnapshot = {
    id,
    filePath: safePath,
    versionPath,
    createdAt,
    size: Buffer.byteLength(currentContent, "utf8")
  };

  const absoluteVersionPath = resolveInside(root, versionPath);
  await fs.mkdir(path.dirname(absoluteVersionPath), { recursive: true });
  await fs.writeFile(absoluteVersionPath, currentContent, "utf8");

  const manifest = await readManifest(root);
  await writeManifest(root, {
    version: 1,
    snapshots: [snapshot, ...manifest.snapshots.filter((item) => item.id !== snapshot.id)]
  });
  return snapshot;
}

export async function listWritingFileVersions(root: string, relativePath: string): Promise<FileVersionSnapshot[]> {
  const safePath = assertSafeNovelPath(relativePath);
  const manifest = await readManifest(root);
  return manifest.snapshots
    .filter((snapshot) => snapshot.filePath === safePath)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function readWritingFileDiff(root: string, relativePath: string, versionId: string): Promise<FileDiffResult> {
  const safePath = assertSafeNovelPath(relativePath);
  const versions = await listWritingFileVersions(root, safePath);
  const fromVersion = versions.find((snapshot) => snapshot.id === versionId);
  if (!fromVersion) {
    throw new Error(`File version not found: ${versionId}`);
  }

  const original = await fs.readFile(resolveInside(root, fromVersion.versionPath), "utf8");
  const modified = await fs.readFile(resolveInside(root, safePath), "utf8");
  return {
    filePath: safePath,
    fromVersion,
    toVersion: {
      id: "current",
      label: "当前文件",
      createdAt: new Date().toISOString()
    },
    original,
    modified
  };
}

export function buildEditorSuggestion(input: EditorSuggestionRequest): EditorSuggestion {
  const createdAt = new Date().toISOString();
  const before = String(input.beforeText || "").trim();
  const after = String(input.afterText || "").trim();
  const lastLine = before.split(/\r?\n/).filter(Boolean).at(-1) || "";
  const isOutline = input.documentKind === "outline";
  const text = isOutline
    ? buildOutlineSuggestion(lastLine)
    : buildProseSuggestion(lastLine, after);

  return {
    id: `editor-suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    summary: isOutline ? "补一条章纲推进建议" : "补一段低侵入正文续写",
    source: "local",
    createdAt
  };
}

function buildOutlineSuggestion(lastLine: string): string {
  const prefix = lastLine.trim().startsWith("-") ? "\n- " : "\n\n- ";
  return `${prefix}补充下一拍：明确角色动机、代价与本章钩子的对应关系。`;
}

function buildProseSuggestion(lastLine: string, after: string): string {
  const needsBreak = lastLine.length > 20 && !/[，。！？；：,.!?;:]$/.test(lastLine);
  const prefix = needsBreak ? "，" : "";
  if (after.startsWith("”") || after.startsWith("\"")) {
    return `${prefix}他把未出口的话压回喉间，只留下一个更沉的停顿。`;
  }
  return `${prefix}他没有立刻回答，先把眼前的变化在心里重新过了一遍。`;
}
