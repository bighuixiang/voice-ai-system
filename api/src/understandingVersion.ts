import crypto from "node:crypto";

export interface UnderstandingVersion {
  schemaVersion: "understanding-version.v1";
  versionId: string;
  rawInput: string;
  items: Array<{ itemId: string; kind: "fact" | "tension" | "inference" | "unknown"; text: string; source: "user" | "system-inference"; userQuote?: string }>;
  supersedesVersionId?: string;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function validateItems(items: readonly UnderstandingVersion["items"][number][]): void { if (!items.length || items.some((item) => !item.itemId.trim() || !item.text.trim() || (item.kind === "fact" && (item.source !== "user" || !item.userQuote?.trim())) || (item.kind !== "fact" && item.source !== "system-inference"))) throw new Error("UNDERSTANDING_VERSION_ITEM_INVALID"); }
export function createUnderstandingVersion(input: { versionId: string; rawInput: string; items: UnderstandingVersion["items"] }): UnderstandingVersion { if (!input.versionId.trim() || !input.rawInput.trim()) throw new Error("UNDERSTANDING_VERSION_FIELDS_REQUIRED"); validateItems(input.items); const base = { schemaVersion: "understanding-version.v1" as const, versionId: input.versionId, rawInput: input.rawInput, items: input.items.map((item) => ({ ...item })) }; return { ...base, fingerprint: hash(base) }; }
export function reviseUnderstandingVersion(previous: UnderstandingVersion, input: { versionId: string; rawInput: string; additions: UnderstandingVersion["items"] }): UnderstandingVersion { if (input.rawInput !== previous.rawInput) throw new Error("UNDERSTANDING_RAW_INPUT_IMMUTABLE"); if (!input.versionId.trim()) throw new Error("UNDERSTANDING_VERSION_FIELDS_REQUIRED"); validateItems(input.additions); const base = { schemaVersion: "understanding-version.v1" as const, versionId: input.versionId, rawInput: previous.rawInput, items: [...previous.items, ...input.additions.map((item) => ({ ...item }))], supersedesVersionId: previous.versionId }; return { ...base, fingerprint: hash(base) }; }
