import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface ProseGenerationManifest { schemaVersion: "prose-generation-manifest.v1"; manifestId: string; decisionConsumptionReceiptRef: string; storyContractRef: string; outlineVersion: string; chapterIntentRef: string; sceneCardRefs: string[]; characterStateRefs: string[]; povStateRef: string; obligationRefs: string[]; authorLockRefs: string[]; craftPatternRefs: string[]; latestAuthorDirection: string; proseBaselineRef: string; planningHorizonRef: string; contextManifestRef: string; sourceRefs: string[]; status: "frozen"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const manifestPath = (root: string, manifestId: string) => resolveInside(root, path.join("sessions", "prose-generation-manifests", `${manifestId}.json`));
const currentManifestPath = (root: string, chapterIntentRef: string) => resolveInside(root, path.join("sessions", "prose-generation-manifests", "current", `${chapterIntentRef.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`));
function assertManifestSemantics(manifest: ProseGenerationManifest): void {
  if (manifest.schemaVersion !== "prose-generation-manifest.v1" || manifest.status !== "frozen" || !manifest.manifestId.trim() || !manifest.decisionConsumptionReceiptRef.trim() || !manifest.latestAuthorDirection.trim()) throw new Error("PROSE_MANIFEST_SEMANTIC_INVALID");
  const scalarRefs = [manifest.storyContractRef, manifest.outlineVersion, manifest.chapterIntentRef, manifest.povStateRef, manifest.proseBaselineRef, manifest.planningHorizonRef, manifest.contextManifestRef];
  const arrayRefs = [manifest.sceneCardRefs, manifest.characterStateRefs, manifest.obligationRefs, manifest.authorLockRefs, manifest.craftPatternRefs, manifest.sourceRefs];
  if (scalarRefs.some((ref) => typeof ref !== "string" || !ref.trim()) || arrayRefs.some((refs) => !Array.isArray(refs) || refs.length === 0 || refs.some((ref) => typeof ref !== "string" || !ref.trim()))) throw new Error("PROSE_MANIFEST_SEMANTIC_INVALID");
}
export function createProseGenerationManifest(input: Omit<ProseGenerationManifest, "schemaVersion" | "status" | "fingerprint">): ProseGenerationManifest {
  if (!input.decisionConsumptionReceiptRef.trim()) throw new Error("PROSE_MANIFEST_DECISION_RECEIPT_REQUIRED");
  const scalarRefs = [input.storyContractRef, input.outlineVersion, input.chapterIntentRef, input.povStateRef, input.proseBaselineRef, input.planningHorizonRef, input.contextManifestRef];
  if (!input.manifestId.trim() || scalarRefs.some((ref) => !ref.trim())) throw new Error("PROSE_MANIFEST_REFERENCE_REQUIRED");
  if (!input.sceneCardRefs.length || !input.characterStateRefs.length || !input.obligationRefs.length || !input.authorLockRefs.length || !input.craftPatternRefs.length || !input.sourceRefs.length) throw new Error("PROSE_MANIFEST_REFERENCE_REQUIRED");
  if (!input.latestAuthorDirection.trim()) throw new Error("PROSE_MANIFEST_DIRECTION_REQUIRED");
  const base = { schemaVersion: "prose-generation-manifest.v1" as const, ...input, sceneCardRefs: [...input.sceneCardRefs], characterStateRefs: [...input.characterStateRefs], obligationRefs: [...input.obligationRefs], authorLockRefs: [...input.authorLockRefs], craftPatternRefs: [...input.craftPatternRefs], sourceRefs: [...input.sourceRefs], status: "frozen" as const };
  return { ...base, fingerprint: hash(base) };
}
export function evaluateProseCandidateFreshness(manifest: ProseGenerationManifest, candidateManifestFingerprint: string): "fresh" | "stale" { return manifest.fingerprint === candidateManifestFingerprint ? "fresh" : "stale"; }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readProseGenerationManifest(root: string, manifestId: string): Promise<ProseGenerationManifest | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath(root, manifestId), "utf8")) as ProseGenerationManifest;
    if (manifest.manifestId !== manifestId) throw new Error("PROSE_MANIFEST_INTEGRITY_FAILED");
    assertManifestSemantics(manifest);
    const { fingerprint: _fingerprint, ...base } = manifest;
    if (!/^[a-f0-9]{64}$/i.test(manifest.fingerprint) || hash(base) !== manifest.fingerprint) throw new Error("PROSE_MANIFEST_INTEGRITY_FAILED");
    return manifest;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function persistProseGenerationManifest(root: string, manifest: ProseGenerationManifest): Promise<{ created: boolean; manifest: ProseGenerationManifest }> {
  assertManifestSemantics(manifest);
  const { fingerprint: _fingerprint, ...base } = manifest;
  if (!/^[a-f0-9]{64}$/i.test(manifest.fingerprint) || hash(base) !== manifest.fingerprint) throw new Error("PROSE_MANIFEST_INTEGRITY_FAILED");
  const existing = await readProseGenerationManifest(root, manifest.manifestId);
  if (existing) {
    if (existing.fingerprint === manifest.fingerprint && JSON.stringify(existing) === JSON.stringify(manifest)) return { created: false, manifest: existing };
    throw new Error("PROSE_MANIFEST_IMMUTABLE");
  }
  await writeJson(manifestPath(root, manifest.manifestId), manifest);
  await writeJson(currentManifestPath(root, manifest.chapterIntentRef), { manifestId: manifest.manifestId, fingerprint: manifest.fingerprint });
  return { created: true, manifest };
}

export async function readCurrentProseGenerationManifest(root: string, chapterIntentRef: string): Promise<ProseGenerationManifest | null> {
  try {
    const pointer = JSON.parse(await fs.readFile(currentManifestPath(root, chapterIntentRef), "utf8")) as { manifestId?: string; fingerprint?: string };
    if (!pointer.manifestId || !pointer.fingerprint) return null;
    const manifest = await readProseGenerationManifest(root, pointer.manifestId);
    return manifest && manifest.chapterIntentRef === chapterIntentRef && manifest.fingerprint === pointer.fingerprint ? manifest : null;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
