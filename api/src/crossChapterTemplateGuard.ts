import crypto from "node:crypto";

export interface CrossChapterTemplateReport { schemaVersion: "cross-chapter-template-report.v1"; reportId: string; status: "passed" | "blocked"; violations: Array<{ code: string; chapterIds: string[]; detail: string; repair: string }>; checkedChapterIds: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateCrossChapterTemplate(input: { reportId: string; chapters: readonly { chapterId: string; openingBeat: string; beats: readonly string[]; repeatedPhrases: readonly string[]; sourceRefs: readonly string[] }[]; intentionalVariations: readonly { chapterIds: readonly string[]; variation: string; evidenceRefs: readonly string[] }[]; evidenceRefs: readonly string[] }): CrossChapterTemplateReport {
  if (!input.reportId.trim()) throw new Error("CROSS_CHAPTER_FIELDS_REQUIRED");
  if (input.chapters.length < 2) throw new Error("CROSS_CHAPTER_SCOPE_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("CROSS_CHAPTER_EVIDENCE_REQUIRED");
  const violations: CrossChapterTemplateReport["violations"] = [];
  for (let index = 1; index < input.chapters.length; index += 1) {
    const previous = input.chapters[index - 1]; const current = input.chapters[index]; const variation = input.intentionalVariations.find((item) => item.chapterIds.includes(previous.chapterId) && item.chapterIds.includes(current.chapterId) && item.variation.trim() && item.evidenceRefs.length);
    if (previous.beats.join(">") === current.beats.join(">") && !variation) violations.push({ code: "CROSS_CHAPTER_BEAT_TEMPLATE", chapterIds: [previous.chapterId, current.chapterId], detail: "Adjacent chapters repeat the same structural beat order.", repair: "Change beat order/function or record intentional variation with evidence." });
    const repeated = current.repeatedPhrases.filter((phrase) => previous.repeatedPhrases.includes(phrase)); if (repeated.length && !variation) violations.push({ code: "CROSS_CHAPTER_PHRASE_REPEAT", chapterIds: [previous.chapterId, current.chapterId], detail: `Repeated phrases: ${repeated.join(", ")}`, repair: "Rewrite surface language while preserving only the necessary motif." });
  }
  const base = { schemaVersion: "cross-chapter-template-report.v1" as const, reportId: input.reportId, status: violations.length ? "blocked" as const : "passed" as const, violations, checkedChapterIds: input.chapters.map((chapter) => chapter.chapterId) };
  return { ...base, fingerprint: hash(base) };
}
