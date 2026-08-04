import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PublicationTree } from "./publicationTree.js";

export type PublicationFormat = "markdown" | "txt";

export interface ExportArtifact {
  format: PublicationFormat;
  relativePath: string;
  mime: "text/markdown; charset=utf-8" | "text/plain; charset=utf-8";
  rendererVersion: "publication-renderer.v1";
  sha256: string;
  size: number;
}

export interface PublicationArtifactSet {
  schemaVersion: "publication-artifact-set.v1";
  artifactSetId: string;
  editionId: string;
  projectSlug: string;
  manifestFingerprint: string;
  treeFingerprint: string;
  status: "validated";
  artifacts: ExportArtifact[];
  createdAt: string;
  fingerprint: string;
}

interface ManifestIdentity { editionId: string; projectSlug: string; title: string; author: string; language: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashBytes(value: Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function setPath(root: string, editionId: string): string { return path.join(root, "sessions", "publication-editions", `${editionId}.artifacts.json`); }
function verifyArtifactSet(set: PublicationArtifactSet): boolean {
  const { fingerprint, ...base } = set;
  return hash(base) === fingerprint;
}
function verifyArtifactSetSemantics(set: PublicationArtifactSet): boolean {
  if (set.schemaVersion !== "publication-artifact-set.v1" || typeof set.artifactSetId !== "string" || !set.artifactSetId.trim() || typeof set.editionId !== "string" || !set.editionId.trim() || typeof set.projectSlug !== "string" || !set.projectSlug.trim() || set.status !== "validated" || typeof set.createdAt !== "string" || !set.createdAt.trim() || !Array.isArray(set.artifacts)) return false;
  const formats = new Set<string>();
  const paths = new Set<string>();
  return set.artifacts.length > 0 && set.artifacts.every((artifact) => {
    if (!artifact || (artifact.format !== "markdown" && artifact.format !== "txt") || formats.has(artifact.format) || typeof artifact.relativePath !== "string" || paths.has(artifact.relativePath) || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(artifact.sha256) || !Number.isInteger(artifact.size) || artifact.size <= 0 || artifact.rendererVersion !== "publication-renderer.v1") return false;
    const expectedMime = artifact.format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
    const expectedPath = `sessions/publication-editions/${set.editionId}.${artifact.format === "markdown" ? "md" : "txt"}`;
    if (artifact.mime !== expectedMime || artifact.relativePath !== expectedPath || artifact.relativePath.includes("..")) return false;
    formats.add(artifact.format); paths.add(artifact.relativePath); return true;
  });
}

function renderMarkdown(manifest: ManifestIdentity, tree: PublicationTree): string {
  const lines = [`# ${manifest.title}`, ``, `作者：${manifest.author}`, ``];
  for (const chapter of tree.chapters) {
    lines.push(`## ${chapter.title}`, ``);
    for (const block of chapter.blocks) {
      if (block.kind === "heading") lines.push(`${"#".repeat(block.level)} ${block.text}`, ``);
      else if (block.kind === "paragraph") lines.push(block.text, ``);
      else lines.push(`---`, ``);
    }
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function renderText(manifest: ManifestIdentity, tree: PublicationTree): string {
  const lines = [manifest.title, `作者：${manifest.author}`, ``];
  for (const chapter of tree.chapters) {
    lines.push(chapter.title, ``);
    for (const block of chapter.blocks) {
      if (block.kind === "heading" || block.kind === "paragraph") lines.push(block.text, ``);
      else lines.push(`* * *`, ``);
    }
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export async function readPublicationArtifactSet(root: string, editionId: string): Promise<PublicationArtifactSet | null> {
  try {
    const set = JSON.parse(await fs.readFile(setPath(root, editionId), "utf8")) as PublicationArtifactSet;
    if (!verifyArtifactSet(set)) throw new Error("PUBLICATION_ARTIFACT_SET_INTEGRITY_FAILED");
    if (!verifyArtifactSetSemantics(set)) throw new Error("PUBLICATION_ARTIFACT_SET_SEMANTIC_INVALID");
    return set;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function renderPublicationArtifacts(root: string, manifest: ManifestIdentity, tree: PublicationTree, requestedFormats: PublicationFormat[]): Promise<PublicationArtifactSet> {
  if (tree.editionId !== manifest.editionId || tree.projectSlug !== manifest.projectSlug || tree.readerSafe !== true) throw new Error("PUBLICATION_ARTIFACT_INPUT_MISMATCH");
  const formats = [...new Set(requestedFormats)].sort();
  if (!formats.length) throw new Error("PUBLICATION_FORMAT_REQUIRED");
  if (formats.some((format) => format !== "markdown" && format !== "txt")) throw new Error("PUBLICATION_FORMAT_UNSUPPORTED");
  const identity = { editionId: manifest.editionId, manifestFingerprint: manifest.fingerprint, treeFingerprint: tree.fingerprint, formats, rendererVersion: "publication-renderer.v1" as const };
  const artifactSetId = `artifacts-${hash(identity).slice(0, 24)}`;
  const existing = await readPublicationArtifactSet(root, manifest.editionId);
  if (existing && existing.artifactSetId === artifactSetId) return existing;
  if (existing) throw new Error("PUBLICATION_ARTIFACT_SET_IMMUTABLE");
  const outputDir = path.join(root, "sessions", "publication-editions");
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  const stagingDir = await fs.mkdtemp(path.join(root, "sessions", `.publication-artifacts-${manifest.editionId}-`));
  try {
    const artifacts: ExportArtifact[] = [];
    for (const format of formats) {
      const body = format === "markdown" ? renderMarkdown(manifest, tree) : renderText(manifest, tree);
      const bytes = Buffer.from(body, "utf8");
      const extension = format === "markdown" ? "md" : "txt";
      const relativePath = path.posix.join("sessions", "publication-editions", `${manifest.editionId}.${extension}`);
      await fs.writeFile(path.join(stagingDir, `${manifest.editionId}.${extension}`), bytes);
      artifacts.push({ format, relativePath, mime: format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8", rendererVersion: "publication-renderer.v1", sha256: hashBytes(bytes), size: bytes.byteLength });
    }
    await fs.mkdir(outputDir, { recursive: true });
    for (const artifact of artifacts) {
      const filename = path.basename(artifact.relativePath);
      await fs.rm(path.join(outputDir, filename), { force: true });
      await fs.rename(path.join(stagingDir, filename), path.join(outputDir, filename));
    }
    const base = { schemaVersion: "publication-artifact-set.v1" as const, artifactSetId, editionId: manifest.editionId, projectSlug: manifest.projectSlug, manifestFingerprint: manifest.fingerprint, treeFingerprint: tree.fingerprint, status: "validated" as const, artifacts, createdAt: new Date().toISOString() };
    const result: PublicationArtifactSet = { ...base, fingerprint: hash(base) };
    const committedPath = setPath(root, manifest.editionId);
    const tempSetPath = `${committedPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempSetPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await fs.rename(tempSetPath, committedPath);
    return result;
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}
