import crypto from "node:crypto";

export interface WritingContextContract { schemaVersion: "writing-context-contract.v1"; requestId: string; sections: { storyContract: string; characterStates: string[]; worldRules: string[]; chapterCard: string; adjacentSummaries: string[]; distantFacts: string[]; openForeshadowing: string[]; styleConstraints: string[]; latestDirection: string }; missingSections: string[]; truncatedSections: string[]; status: "ready" | "blocked"; totalChars: number; maxChars: number; fingerprint: string; }
const sectionKeys = ["storyContract", "characterStates", "worldRules", "chapterCard", "adjacentSummaries", "distantFacts", "openForeshadowing", "styleConstraints", "latestDirection"] as const;
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assembleWritingContextContract(input: { requestId: string; storyContract: string; characterStates: readonly string[]; worldRules: readonly string[]; chapterCard: string; adjacentSummaries: readonly string[]; distantFacts: readonly string[]; openForeshadowing: readonly string[]; styleConstraints: readonly string[]; latestDirection: string; limits: { maxChars: number } }): WritingContextContract {
  if (!input.requestId.trim() || input.limits.maxChars < 1) throw new Error("WRITING_CONTEXT_FIELDS_REQUIRED");
  const sections = { storyContract: input.storyContract, characterStates: [...input.characterStates], worldRules: [...input.worldRules], chapterCard: input.chapterCard, adjacentSummaries: [...input.adjacentSummaries], distantFacts: [...input.distantFacts], openForeshadowing: [...input.openForeshadowing], styleConstraints: [...input.styleConstraints], latestDirection: input.latestDirection };
  const truncatedSections = sectionKeys.filter((key) => String(sections[key]).includes("truncated") || String(sections[key]).includes("截断") || String(sections[key]).includes("[..."));
  const missingSections = sectionKeys.filter((key) => (Array.isArray(sections[key]) ? sections[key].length === 0 : !String(sections[key]).trim()) || truncatedSections.includes(key));
  const totalChars = JSON.stringify(sections).length;
  if (totalChars > input.limits.maxChars) throw new Error("WRITING_CONTEXT_BUDGET_EXCEEDED");
  const base = { schemaVersion: "writing-context-contract.v1" as const, requestId: input.requestId, sections, missingSections, truncatedSections, status: missingSections.length || truncatedSections.length ? "blocked" as const : "ready" as const, totalChars, maxChars: input.limits.maxChars };
  return { ...base, fingerprint: hash(base) };
}
