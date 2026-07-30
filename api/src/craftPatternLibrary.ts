import crypto from "node:crypto";

export type CraftPatternCategory = "opening-pressure" | "choice-cost" | "information-gap" | "dialogue-subtext" | "character-arc" | "combat-feedback" | "daily-life";
export interface CraftPattern { schemaVersion: "craft-pattern.v1"; patternId: string; name: string; category: CraftPatternCategory; purpose: string; observableMoves: string[]; transferContexts: string[]; forbiddenImitationFeatures: string[]; sourceRefs: string[]; status: "active"; fingerprint: string; }
export interface CraftPatternValidation { schemaVersion: "craft-pattern-validation.v1"; patternId: string; status: "usable" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createCraftPattern(input: Omit<CraftPattern, "schemaVersion" | "status" | "fingerprint">): CraftPattern {
  if (!input.patternId.trim() || !input.name.trim() || !input.purpose.trim()) throw new Error("CRAFT_PATTERN_FIELDS_REQUIRED");
  if (!input.observableMoves.length) throw new Error("CRAFT_PATTERN_MOVES_REQUIRED");
  if (!input.transferContexts.length) throw new Error("CRAFT_PATTERN_TRANSFER_CONTEXT_REQUIRED");
  if (!input.forbiddenImitationFeatures.length) throw new Error("CRAFT_PATTERN_ANTI_IMITATION_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("CRAFT_PATTERN_SOURCE_REQUIRED");
  const base = { schemaVersion: "craft-pattern.v1" as const, ...input, observableMoves: [...input.observableMoves], transferContexts: [...input.transferContexts], forbiddenImitationFeatures: [...input.forbiddenImitationFeatures], sourceRefs: [...input.sourceRefs], status: "active" as const };
  return { ...base, fingerprint: hash(base) };
}
export function validateCraftPattern(pattern: CraftPattern): CraftPatternValidation {
  const issues = [pattern.observableMoves.length ? "" : "CRAFT_PATTERN_MOVES_REQUIRED", pattern.transferContexts.length ? "" : "CRAFT_PATTERN_TRANSFER_CONTEXT_REQUIRED", pattern.forbiddenImitationFeatures.length ? "" : "CRAFT_PATTERN_ANTI_IMITATION_REQUIRED"].filter(Boolean);
  const base = { schemaVersion: "craft-pattern-validation.v1" as const, patternId: pattern.patternId, status: issues.length ? "blocked" as const : "usable" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
