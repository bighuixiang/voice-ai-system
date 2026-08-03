import crypto from "node:crypto";

export type ObjectiveKind = "hard_constraint" | "preference" | "aspiration" | "anti_goal" | "unknown";
export type ObjectiveScope = "work" | "volume" | "arc" | "chapter" | "scene" | "character" | "pov" | "paragraph";
export interface CreativeObjectiveItem { objectiveId: string; kind: ObjectiveKind; text: string; scope: ObjectiveScope; sourceRefs: string[]; verification: string; }
export interface CreativeObjectiveProfile { schemaVersion: "creative-objective-profile.v1"; profileId: string; projectSlug: string; version: number; stage: "understanding" | "contract" | "outline" | "drafting" | "revision"; items: CreativeObjectiveItem[]; fingerprint: string; }
export interface ObjectiveConflict { schemaVersion: "objective-conflict.v1"; conflictId: string; left: CreativeObjectiveItem; right: CreativeObjectiveItem; benefits: string[]; costs: string[]; affectedScopes: string[]; compromises: string[]; evidenceRefs: string[]; level: "L1" | "L2"; status: "reviewable" | "needs-author"; authorRequired: boolean; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizeItem = (item: CreativeObjectiveItem): CreativeObjectiveItem => ({ ...item, text: item.text.trim(), sourceRefs: [...item.sourceRefs] });

export function createCreativeObjectiveProfile(input: Omit<CreativeObjectiveProfile, "schemaVersion" | "fingerprint">): CreativeObjectiveProfile {
  if (!input.profileId.trim() || !input.projectSlug.trim() || input.version < 1 || !input.items.length) throw new Error("OBJECTIVE_PROFILE_FIELDS_REQUIRED");
  const items = input.items.map(normalizeItem);
  if (items.some((item) => !item.objectiveId.trim() || !item.text || !item.verification.trim())) throw new Error("OBJECTIVE_ITEM_FIELDS_REQUIRED");
  if (items.some((item) => !item.sourceRefs.length)) throw new Error("OBJECTIVE_SOURCE_REQUIRED");
  const ids = new Set<string>();
  for (const item of items) { if (ids.has(item.objectiveId)) throw new Error("OBJECTIVE_ID_DUPLICATE"); ids.add(item.objectiveId); }
  const base = { schemaVersion: "creative-objective-profile.v1" as const, profileId: input.profileId, projectSlug: input.projectSlug, version: input.version, stage: input.stage, items };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateObjectiveConflict(input: Omit<ObjectiveConflict, "schemaVersion" | "level" | "status" | "authorRequired" | "fingerprint">): ObjectiveConflict {
  if (!input.conflictId.trim() || !input.left.text.trim() || !input.right.text.trim() || !input.benefits.length || !input.costs.length || !input.affectedScopes.length || !input.compromises.length) throw new Error("OBJECTIVE_CONFLICT_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("OBJECTIVE_CONFLICT_EVIDENCE_REQUIRED");
  const level = input.left.kind === "hard_constraint" && input.right.kind === "hard_constraint" ? "L2" as const : "L1" as const;
  const base = { schemaVersion: "objective-conflict.v1" as const, ...input, left: normalizeItem(input.left), right: normalizeItem(input.right), benefits: [...input.benefits], costs: [...input.costs], affectedScopes: [...input.affectedScopes], compromises: [...input.compromises], evidenceRefs: [...input.evidenceRefs], level, status: level === "L2" ? "needs-author" as const : "reviewable" as const, authorRequired: level === "L2" };
  return { ...base, fingerprint: hash(base) };
}
