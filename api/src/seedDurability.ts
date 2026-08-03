import crypto from "node:crypto";

export interface LegacySeedShadow { schemaVersion: "legacy-seed-shadow.v1"; projectId: string; mode: "shadow"; changesCanon: false; sourceRefs: string[]; conflicts: string[]; unknown: string[]; fingerprint: string; }
export interface SeedReplay { schemaVersion: "seed-replay.v1"; compilerVersion: string; inputFingerprint: string; outputFingerprint: string; output: unknown; fingerprint: string; }
export interface StoryContractReadinessProof { schemaVersion: "story-contract-readiness-proof.v1"; target: string; requiredFields: string[]; evidenceCovered: string[]; unresolved: string[]; provisionalAssumptions: string[]; authorAdopted: string[]; conflicts: string[]; conclusion: "sufficient-for-target" | "insufficient"; claimsWholeNovelSolved: false; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function compileLegacySeedShadow(input: { projectId: string; materials: ReadonlyArray<{ source: string; text: string }> }): LegacySeedShadow {
  if (!input.projectId.trim() || !input.materials.length) throw new Error("LEGACY_SEED_MATERIALS_REQUIRED");
  const sourceRefs = input.materials.map((material) => material.source); const base = { schemaVersion: "legacy-seed-shadow.v1" as const, projectId: input.projectId, mode: "shadow" as const, changesCanon: false as const, sourceRefs, conflicts: [], unknown: ["author-adoption"] };
  return { ...base, fingerprint: hash(base) };
}

export function replaySeedCompilation(input: { compilerVersion: string; inputFingerprint: string; output: unknown }): SeedReplay {
  if (!input.compilerVersion.trim() || !input.inputFingerprint.trim()) throw new Error("SEED_REPLAY_FIELDS_REQUIRED");
  const outputFingerprint = hash({ compilerVersion: input.compilerVersion, inputFingerprint: input.inputFingerprint, output: input.output }); const base = { schemaVersion: "seed-replay.v1" as const, compilerVersion: input.compilerVersion, inputFingerprint: input.inputFingerprint, outputFingerprint, output: input.output };
  return { ...base, fingerprint: hash(base) };
}

export function createStoryContractReadinessProof(input: Omit<StoryContractReadinessProof, "schemaVersion" | "conclusion" | "claimsWholeNovelSolved" | "fingerprint">): StoryContractReadinessProof {
  if (!input.target.trim() || !input.requiredFields.length) throw new Error("READINESS_PROOF_FIELDS_REQUIRED");
  const conclusion = input.requiredFields.every((field) => input.evidenceCovered.includes(field) && input.authorAdopted.includes(field)) && !input.conflicts.length ? "sufficient-for-target" as const : "insufficient" as const;
  const base = { schemaVersion: "story-contract-readiness-proof.v1" as const, ...input, conclusion, claimsWholeNovelSolved: false as const };
  return { ...base, fingerprint: hash(base) };
}
