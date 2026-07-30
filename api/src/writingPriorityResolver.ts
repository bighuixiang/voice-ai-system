import crypto from "node:crypto";

export type WritingPriorityLayer = "lockedCanon" | "authorDirection" | "povCharacter" | "sceneFunction" | "projectPreference" | "craftPattern" | "genreProfile" | "platformDefault";
export interface WritingPriorityItem { key: string; value: string; source: string; }
export interface WritingPriorityResult { schemaVersion: "writing-priority-resolution.v1"; requestId: string; resolved: WritingPriorityItem[]; conflicts: Array<{ key: string; sources: string[]; minimalQuestion: string }>; status: "resolved" | "blocked"; fingerprint: string; }
const order: WritingPriorityLayer[] = ["lockedCanon", "authorDirection", "povCharacter", "sceneFunction", "projectPreference", "craftPattern", "genreProfile", "platformDefault"];
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function resolveWritingPriority(input: { requestId: string; layers: Record<WritingPriorityLayer, readonly WritingPriorityItem[]>; sceneMode: string; evidenceRefs: readonly string[] }): WritingPriorityResult {
  if (!input.requestId.trim() || !input.evidenceRefs.length) throw new Error("WRITING_PRIORITY_EVIDENCE_REQUIRED");
  const grouped = new Map<string, Array<WritingPriorityItem & { layer: WritingPriorityLayer }>>();
  for (const layer of order) for (const item of input.layers[layer] ?? []) { if (!item.key.trim() || !item.value.trim()) continue; grouped.set(item.key, [...(grouped.get(item.key) ?? []), { ...item, layer }]); }
  const conflicts: WritingPriorityResult["conflicts"] = []; const resolved: WritingPriorityItem[] = [];
  for (const [key, items] of grouped) {
    const top = items[0]; const distinct = new Set(items.map((item) => item.value));
    const high = items.filter((item) => item.layer === "lockedCanon" || item.layer === "authorDirection");
    if (new Set(high.map((item) => item.value)).size > 1 && high.some((item) => item.layer === "lockedCanon") && high.some((item) => item.layer === "authorDirection")) conflicts.push({ key, sources: high.map((item) => item.source), minimalQuestion: `Which value should govern ${key}: locked canon or current author direction?` });
    else if (!(input.sceneMode === "aftermath" && top.layer === "craftPattern" && key === "opening")) resolved.push({ key, value: top.value, source: top.source });
  }
  const base = { schemaVersion: "writing-priority-resolution.v1" as const, requestId: input.requestId, resolved, conflicts, status: conflicts.length ? "blocked" as const : "resolved" as const };
  return { ...base, fingerprint: hash(base) };
}
