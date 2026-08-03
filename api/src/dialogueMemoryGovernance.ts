import crypto from "node:crypto";

type Probe = { probeId: string; frozenFacts: readonly string[]; dimension: string; variants: ReadonlyArray<{ variantId: string; text: string }> };
export interface PreferenceProbeSelection { schemaVersion: "preference-probe-selection.v1"; selectionId: string; probeId: string; selectedVariantId: string; hypothesis: string; reason: string; scope: "scene" | "chapter" | "project"; validationContexts: string[]; evidenceRefs: string[]; adoption: "preference_only"; canonWritten: false; status: "active" | "revoked"; revocationReason?: string; fingerprint: string; }
export interface DialogueMemoryRecord { schemaVersion: "dialogue-memory-record.v1"; memoryId: string; projectSlug: string; content: string; sourceRefs: string[]; scope: "scene" | "chapter" | "project"; confidence: "explicit" | "inferred" | "provisional"; derivedCanonRefs: string[]; compressionVersion: string; status: "effective" | "corrected" | "forgotten"; correctionRefs: string[]; forgetReason?: string; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createPreferenceProbeSelection(input: { probe: Probe; selectedVariantId: string; reason: string; scope: PreferenceProbeSelection["scope"]; validationContexts: readonly string[]; evidenceRefs: readonly string[] }): PreferenceProbeSelection {
  if (!input.probe.probeId.trim() || input.probe.variants.length !== 2 || !input.selectedVariantId.trim() || !input.reason.trim()) throw new Error("PREFERENCE_SELECTION_FIELDS_REQUIRED");
  const selected = input.probe.variants.find((variant) => variant.variantId === input.selectedVariantId);
  if (!selected) throw new Error("PREFERENCE_SELECTION_VARIANT_INVALID");
  if (!input.evidenceRefs.length) throw new Error("PREFERENCE_SELECTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "preference-probe-selection.v1" as const, selectionId: `selection-${input.probe.probeId}-${selected.variantId}`, probeId: input.probe.probeId, selectedVariantId: selected.variantId, hypothesis: `${input.probe.dimension}=${selected.text}`, reason: input.reason, scope: input.scope, validationContexts: [...input.validationContexts], evidenceRefs: [...input.evidenceRefs], adoption: "preference_only" as const, canonWritten: false as const, status: "active" as const };
  return { ...base, fingerprint: hash(base) };
}

export function acceptPreferenceProbeSelection(selection: PreferenceProbeSelection, input: { action: "revoke"; reason: string }): PreferenceProbeSelection {
  if (selection.status !== "active") throw new Error("PREFERENCE_SELECTION_NOT_ACTIVE");
  if (!input.reason.trim()) throw new Error("PREFERENCE_REVOCATION_REASON_REQUIRED");
  const base = { ...selection, status: "revoked" as const, revocationReason: input.reason };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}

export function createDialogueMemoryRecord(input: Omit<DialogueMemoryRecord, "schemaVersion" | "status" | "correctionRefs" | "fingerprint">): DialogueMemoryRecord {
  if (!input.memoryId.trim() || !input.projectSlug.trim() || !input.content.trim() || !input.sourceRefs.length || !input.compressionVersion.trim()) throw new Error("MEMORY_RECORD_FIELDS_REQUIRED");
  const base = { schemaVersion: "dialogue-memory-record.v1" as const, ...input, sourceRefs: [...input.sourceRefs], derivedCanonRefs: [...input.derivedCanonRefs], status: "effective" as const, correctionRefs: [] as string[] };
  return { ...base, fingerprint: hash(base) };
}

export function reviseDialogueMemory(record: DialogueMemoryRecord, input: { correctedContent: string; correctionRef: string; reason: string }): DialogueMemoryRecord {
  if (!input.correctedContent.trim() || !input.correctionRef.trim() || !input.reason.trim()) throw new Error("MEMORY_CORRECTION_REQUIRED");
  const base = { ...record, content: input.correctedContent, status: "corrected" as const, correctionRefs: [...new Set([...record.correctionRefs, input.correctionRef])] };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}

export function forgetDialogueMemory(record: DialogueMemoryRecord, reason: string): DialogueMemoryRecord {
  if (!reason.trim()) throw new Error("MEMORY_FORGET_REASON_REQUIRED");
  if (record.derivedCanonRefs.length) throw new Error("MEMORY_CANON_IMPACT_REVIEW_REQUIRED");
  const base = { ...record, status: "forgotten" as const, forgetReason: reason };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}
