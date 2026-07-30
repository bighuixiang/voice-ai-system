import crypto from "node:crypto";

export interface ProseGenerationManifest { schemaVersion: "prose-generation-manifest.v1"; manifestId: string; storyContractRef: string; outlineVersion: string; chapterIntentRef: string; sceneCardRefs: string[]; characterStateRefs: string[]; povStateRef: string; obligationRefs: string[]; authorLockRefs: string[]; craftPatternRefs: string[]; latestAuthorDirection: string; proseBaselineRef: string; planningHorizonRef: string; contextManifestRef: string; sourceRefs: string[]; status: "frozen"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createProseGenerationManifest(input: Omit<ProseGenerationManifest, "schemaVersion" | "status" | "fingerprint">): ProseGenerationManifest {
  const scalarRefs = [input.storyContractRef, input.outlineVersion, input.chapterIntentRef, input.povStateRef, input.proseBaselineRef, input.planningHorizonRef, input.contextManifestRef];
  if (!input.manifestId.trim() || scalarRefs.some((ref) => !ref.trim())) throw new Error("PROSE_MANIFEST_REFERENCE_REQUIRED");
  if (!input.sceneCardRefs.length || !input.characterStateRefs.length || !input.obligationRefs.length || !input.authorLockRefs.length || !input.craftPatternRefs.length || !input.sourceRefs.length) throw new Error("PROSE_MANIFEST_REFERENCE_REQUIRED");
  if (!input.latestAuthorDirection.trim()) throw new Error("PROSE_MANIFEST_DIRECTION_REQUIRED");
  const base = { schemaVersion: "prose-generation-manifest.v1" as const, ...input, sceneCardRefs: [...input.sceneCardRefs], characterStateRefs: [...input.characterStateRefs], obligationRefs: [...input.obligationRefs], authorLockRefs: [...input.authorLockRefs], craftPatternRefs: [...input.craftPatternRefs], sourceRefs: [...input.sourceRefs], status: "frozen" as const };
  return { ...base, fingerprint: hash(base) };
}
export function evaluateProseCandidateFreshness(manifest: ProseGenerationManifest, candidateManifestFingerprint: string): "fresh" | "stale" { return manifest.fingerprint === candidateManifestFingerprint ? "fresh" : "stale"; }
