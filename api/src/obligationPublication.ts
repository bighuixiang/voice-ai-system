import crypto from "node:crypto";

export interface ObligationEditorMarkers { schemaVersion: "obligation-editor-markers.v1"; manuscriptText: string; markers: Array<{ obligationId: string; status: string; start: number; end: number; display: "icon" }>; fingerprint: string; }
export interface ObligationPublication { schemaVersion: "obligation-publication.v1"; publicationId: string; version: string; frozen: true; readerView: { obligations: Array<{ obligationId: string; status: string }> }; auditView: { obligations: Array<{ obligationId: string; status: string; evidenceFingerprint: string }> }; fingerprint: string; }
export interface ObligationCompletionGate { schemaVersion: "obligation-completion-gate.v1"; status: "passed" | "blocked"; blockers: string[]; sourceCoverageComplete: boolean; fingerprint: string; }
export interface LegacyObligationMigration { schemaVersion: "legacy-obligation-migration.v1"; candidates: Array<{ candidateId: string; source: string; legacyId: string; text: string; status: "candidate" }>; changesCanon: false; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createObligationEditorMarkers(input: { manuscriptText: string; markers: readonly Array<{ obligationId: string; status: string; start: number; end: number }> }): ObligationEditorMarkers {
  if (typeof input.manuscriptText !== "string") throw new Error("MANUSCRIPT_TEXT_REQUIRED");
  const markers = input.markers.map((marker) => { if (!marker.obligationId.trim() || marker.start < 0 || marker.end <= marker.start || marker.end > input.manuscriptText.length) throw new Error("EDITOR_MARKER_INVALID"); return { ...marker, display: "icon" as const }; });
  const base = { schemaVersion: "obligation-editor-markers.v1" as const, manuscriptText: input.manuscriptText, markers };
  return { ...base, fingerprint: hash(base) };
}
export function freezeObligationPublication(input: { publicationId: string; version: string; obligations: readonly Array<{ obligationId: string; status: string; evidenceFingerprint: string }> }): ObligationPublication {
  if (!input.publicationId.trim() || !input.version.trim() || !input.obligations.length) throw new Error("PUBLICATION_OBLIGATIONS_REQUIRED");
  const auditView = { obligations: input.obligations.map((obligation) => ({ ...obligation })) }; const readerView = { obligations: input.obligations.map(({ obligationId, status }) => ({ obligationId, status })) }; const base = { schemaVersion: "obligation-publication.v1" as const, publicationId: input.publicationId, version: input.version, frozen: true as const, readerView, auditView };
  return { ...base, fingerprint: hash(base) };
}
export function evaluateObligationCompletionGate(input: { required: readonly Array<{ obligationId: string; status: string; evidenceFresh: boolean }>; sourceCoverageComplete: boolean }): ObligationCompletionGate {
  const blockers = input.required.filter((obligation) => obligation.status !== "paid" || !obligation.evidenceFresh).map((obligation) => obligation.obligationId); if (!input.sourceCoverageComplete) blockers.push("source-coverage"); const base = { schemaVersion: "obligation-completion-gate.v1" as const, status: blockers.length ? "blocked" as const : "passed" as const, blockers, sourceCoverageComplete: input.sourceCoverageComplete };
  return { ...base, fingerprint: hash(base) };
}
export function migrateLegacyObligations(input: { records: readonly Array<{ source: string; id: string; text: string }> }): LegacyObligationMigration {
  if (!input.records.length) throw new Error("LEGACY_RECORDS_REQUIRED");
  const candidates = input.records.map((record) => ({ candidateId: `legacy-candidate-${hash(record).slice(0, 12)}`, source: record.source, legacyId: record.id, text: record.text, status: "candidate" as const })); const base = { schemaVersion: "legacy-obligation-migration.v1" as const, candidates, changesCanon: false as const };
  return { ...base, fingerprint: hash(base) };
}
