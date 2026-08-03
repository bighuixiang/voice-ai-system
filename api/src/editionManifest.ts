import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlement } from "./chapterSettlement.js";

export interface EditionChapter {
  chapterId: string;
  title: string;
  order: number;
  contentPath: string;
  settlementId: string;
  contentSha256: string;
}

export interface EditionManifest {
  schemaVersion: "edition-manifest.v1";
  editionId: string;
  projectSlug: string;
  canonCommitFingerprint: string;
  title: string;
  author: string;
  language: string;
  status: "frozen";
  readerSafe: true;
  chapters: EditionChapter[];
  publicationTreeFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

interface EditionInput {
  root: string;
  projectSlug: string;
  canonCommitFingerprint: string;
  title: string;
  author: string;
  language: string;
  chapters: Array<Omit<EditionChapter, "contentSha256">>;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function manifestPath(root: string, editionId: string): string { return resolveInside(root, `sessions/publication-editions/${editionId}.json`); }
function verifyManifest(manifest: EditionManifest): boolean {
  const { fingerprint, ...base } = manifest;
  return hash(base) === fingerprint;
}
function verifyManifestSemantics(manifest: EditionManifest): boolean {
  if (manifest.schemaVersion !== "edition-manifest.v1" || typeof manifest.editionId !== "string" || !manifest.editionId.trim() || typeof manifest.projectSlug !== "string" || !manifest.projectSlug.trim() || typeof manifest.canonCommitFingerprint !== "string" || !manifest.canonCommitFingerprint.trim() || typeof manifest.title !== "string" || !manifest.title.trim() || typeof manifest.author !== "string" || !manifest.author.trim() || typeof manifest.language !== "string" || !manifest.language.trim() || manifest.status !== "frozen" || manifest.readerSafe !== true || typeof manifest.createdAt !== "string" || !manifest.createdAt.trim() || !Array.isArray(manifest.chapters)) return false;
  const ids = new Set<string>();
  const orders = new Set<number>();
  return manifest.chapters.every((chapter) => typeof chapter.chapterId === "string" && chapter.chapterId.trim() && !ids.has(chapter.chapterId) && (ids.add(chapter.chapterId), typeof chapter.title === "string" && chapter.title.trim() && Number.isInteger(chapter.order) && chapter.order >= 1 && !orders.has(chapter.order) && (orders.add(chapter.order), typeof chapter.contentPath === "string" && chapter.contentPath.trim() && typeof chapter.settlementId === "string" && chapter.settlementId.trim() && typeof chapter.contentSha256 === "string" && /^[a-f0-9]{64}$/i.test(chapter.contentSha256))));
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readEditionManifest(root: string, editionId: string): Promise<EditionManifest | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath(root, editionId), "utf8")) as EditionManifest;
    if (!verifyManifest(manifest)) throw new Error("EDITION_MANIFEST_INTEGRITY_FAILED");
    if (!verifyManifestSemantics(manifest)) throw new Error("EDITION_MANIFEST_SEMANTIC_INVALID");
    return manifest;
  }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createEditionManifest(input: EditionInput): Promise<EditionManifest> {
  if (!input.projectSlug.trim() || !input.canonCommitFingerprint.trim()) throw new Error("EDITION_IDENTITY_REQUIRED");
  if (!input.title.trim() || !input.author.trim() || !input.language.trim()) throw new Error("EDITION_METADATA_REQUIRED");
  if (!input.chapters.length) throw new Error("EDITION_CHAPTERS_REQUIRED");
  const ids = new Set<string>();
  const orders = new Set<number>();
  const chapters: EditionChapter[] = [];
  for (const chapter of input.chapters) {
    if (!chapter.chapterId.trim() || ids.has(chapter.chapterId) || !Number.isInteger(chapter.order) || chapter.order < 1 || orders.has(chapter.order)) throw new Error("EDITION_CHAPTER_ORDER_INVALID");
    ids.add(chapter.chapterId); orders.add(chapter.order);
    const settlement = await readChapterSettlement(input.root, chapter.settlementId);
    if (!settlement || settlement.status !== "settled" || settlement.projectSlug !== input.projectSlug || settlement.chapterId !== chapter.chapterId) throw new Error("EDITION_CHAPTER_SETTLEMENT_REQUIRED");
    const settlementBase = { ...settlement } as Record<string, unknown>;
    const settlementFingerprint = settlementBase.fingerprint;
    delete settlementBase.fingerprint;
    if (typeof settlementFingerprint !== "string" || hash(settlementBase) !== settlementFingerprint) throw new Error("EDITION_SETTLEMENT_INTEGRITY_FAILED");
    const content = await fs.readFile(resolveInside(input.root, chapter.contentPath), "utf8");
    const contentSha256 = hashText(content);
    if (contentSha256 !== settlement.adoptedContentSha256) throw new Error("EDITION_CHAPTER_CONTENT_STALE");
    chapters.push({ ...chapter, contentSha256 });
  }
  chapters.sort((a, b) => a.order - b.order);
  const treeBase = { projectSlug: input.projectSlug, canonCommitFingerprint: input.canonCommitFingerprint, chapters };
  const publicationTreeFingerprint = hash(treeBase);
  const identityBase = { ...treeBase, title: input.title, author: input.author, language: input.language, publicationTreeFingerprint };
  const editionId = `edition-${hash(identityBase).slice(0, 24)}`;
  const existing = await readEditionManifest(input.root, editionId);
  if (existing) return existing;
  const base = {
    schemaVersion: "edition-manifest.v1" as const,
    editionId,
    projectSlug: input.projectSlug,
    canonCommitFingerprint: input.canonCommitFingerprint,
    title: input.title,
    author: input.author,
    language: input.language,
    status: "frozen" as const,
    readerSafe: true as const,
    chapters,
    publicationTreeFingerprint,
    createdAt: new Date().toISOString()
  };
  const manifest: EditionManifest = { ...base, fingerprint: hash(base) };
  await writeJson(manifestPath(input.root, editionId), manifest);
  return manifest;
}
