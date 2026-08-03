import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { EditionManifest } from "./editionManifest.js";

export type PublicationBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "scene_break" };

export interface PublicationTreeChapter {
  chapterId: string;
  title: string;
  order: number;
  blocks: PublicationBlock[];
}

export interface PublicationTree {
  schemaVersion: "publication-tree.v1";
  editionId: string;
  projectSlug: string;
  readerSafe: true;
  chapters: PublicationTreeChapter[];
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function treePath(root: string, editionId: string): string { return resolveInside(root, `sessions/publication-editions/${editionId}.tree.json`); }
function verifyTree(tree: PublicationTree): boolean {
  const { fingerprint, ...base } = tree;
  return hash(base) === fingerprint;
}
function verifyTreeSemantics(tree: PublicationTree): boolean {
  if (tree.schemaVersion !== "publication-tree.v1" || typeof tree.editionId !== "string" || !tree.editionId.trim() || typeof tree.projectSlug !== "string" || !tree.projectSlug.trim() || tree.readerSafe !== true || !Array.isArray(tree.chapters)) return false;
  return tree.chapters.every((chapter) => typeof chapter.chapterId === "string" && chapter.chapterId.trim() && typeof chapter.title === "string" && chapter.title.trim() && Number.isInteger(chapter.order) && Array.isArray(chapter.blocks) && chapter.blocks.every((block) => block.kind === "scene_break" || ((block.kind === "paragraph" || block.kind === "heading") && typeof block.text === "string" && block.text.trim() && (block.kind !== "heading" || Number.isInteger(block.level) && block.level >= 1 && block.level <= 6))));
}

async function writeTree(target: string, tree: PublicationTree): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(tree, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

function parseBlocks(content: string): PublicationBlock[] {
  if (/\b(?:PROMPT|SYSTEM|TOOL|TASK|SECRET)\s*:/i.test(content)) throw new Error("PUBLICATION_TREE_INTERNAL_CONTENT");
  const blocks: PublicationBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() }); paragraph = []; } };
  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() }); continue; }
    if (/^(?:---+|\*\s*\*\s*\*)$/.test(line)) { flush(); blocks.push({ kind: "scene_break" }); continue; }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export async function compilePublicationTree(root: string, manifest: EditionManifest): Promise<PublicationTree> {
  if (manifest.status !== "frozen" || manifest.readerSafe !== true) throw new Error("PUBLICATION_TREE_EDITION_NOT_FROZEN");
  const chapters: PublicationTreeChapter[] = [];
  for (const chapter of [...manifest.chapters].sort((a, b) => a.order - b.order)) {
    const content = await fs.readFile(resolveInside(root, chapter.contentPath), "utf8");
    if (hashText(content) !== chapter.contentSha256) throw new Error("PUBLICATION_TREE_CONTENT_STALE");
    chapters.push({ chapterId: chapter.chapterId, title: chapter.title, order: chapter.order, blocks: parseBlocks(content) });
  }
  const base = { schemaVersion: "publication-tree.v1" as const, editionId: manifest.editionId, projectSlug: manifest.projectSlug, readerSafe: true as const, chapters };
  return { ...base, fingerprint: hash(base) };
}

export async function readPublicationTree(root: string, editionId: string): Promise<PublicationTree | null> {
  try {
    const tree = JSON.parse(await fs.readFile(treePath(root, editionId), "utf8")) as PublicationTree;
    if (!verifyTree(tree)) throw new Error("PUBLICATION_TREE_INTEGRITY_FAILED");
    if (!verifyTreeSemantics(tree)) throw new Error("PUBLICATION_TREE_SEMANTIC_INVALID");
    return tree;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function compileAndPersistPublicationTree(root: string, manifest: EditionManifest): Promise<PublicationTree> {
  const existing = await readPublicationTree(root, manifest.editionId);
  if (existing) return existing;
  const tree = await compilePublicationTree(root, manifest);
  await writeTree(treePath(root, manifest.editionId), tree);
  return tree;
}
