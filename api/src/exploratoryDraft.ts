import crypto from "node:crypto";

export interface ExploratoryDraft { schemaVersion: "exploratory-draft.v1"; draftId: string; text: string; status: "candidate"; isCanon: false; sourceRefs: string[]; adoptionRequired: boolean; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createExploratoryDraft(input: { draftId: string; text: string; sourceRefs: readonly string[] }): ExploratoryDraft {
  if (!input.draftId.trim() || !input.text.trim()) throw new Error("EXPLORATORY_DRAFT_FIELDS_REQUIRED");
  const base = { schemaVersion: "exploratory-draft.v1" as const, draftId: input.draftId, text: input.text, status: "candidate" as const, isCanon: false as const, sourceRefs: [...input.sourceRefs], adoptionRequired: true as const };
  return { ...base, fingerprint: hash(base) };
}
