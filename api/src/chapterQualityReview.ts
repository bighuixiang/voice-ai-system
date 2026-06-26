import type {
  ChapterDashboard,
  ChapterQualityMetric,
  ChapterQualityReport,
  QualityMetricKey,
  SceneCard
} from "./types.js";

type ReviewMetricKey = Extract<QualityMetricKey, "rhythm" | "conflict" | "emotion" | "information" | "prose" | "hook" | "tension">;

export interface QualityReviewOutcome {
  report: ChapterQualityReport;
  topIssues: string[];
  antiPatternsHit: string[];
  openingVerdict: string;
  endingVerdict: string;
  rulesBasedSignals: string[];
}

interface RuleReviewInput {
  chapterId: string;
  content: string;
  dashboard?: Partial<ChapterDashboard> | null;
  scenes?: SceneCard[] | null;
  targetScore?: number;
  currentQualityReport?: ChapterQualityReport | null;
}

interface ParsedAiReview {
  report?: Partial<ChapterQualityReport>;
  topIssues?: string[];
  antiPatternsHit?: string[];
  openingVerdict?: string;
  endingVerdict?: string;
  rulesBasedSignals?: string[];
}

const reviewMetrics: Array<{ key: ReviewMetricKey; label: string }> = [
  { key: "rhythm", label: "Rhythm" },
  { key: "conflict", label: "Conflict" },
  { key: "emotion", label: "Emotion" },
  { key: "information", label: "Information" },
  { key: "prose", label: "Prose" },
  { key: "hook", label: "Hook" },
  { key: "tension", label: "Tension" }
];

const pressureTerms = [
  "pressure",
  "danger",
  "cost",
  "seal",
  "omen",
  "blood",
  "oath",
  "ruin",
  "formation",
  "enemy",
  "threat",
  "kill",
  "杀",
  "镇压",
  "威压",
  "封印",
  "血",
  "异象",
  "阵",
  "劫",
  "危机",
  "代价",
  "敌"
];
const reactionTerms = [
  "breath",
  "pulse",
  "bones",
  "skin",
  "eyes",
  "blood",
  "pain",
  "shiver",
  "stagger",
  "grit",
  "breathing",
  "heartbeat",
  "喘",
  "麻",
  "血",
  "疼",
  "汗",
  "眼",
  "呼吸",
  "心跳",
  "发麻",
  "额",
  "踉跄"
];
const informationTerms = ["realized", "saw", "learned", "revealed", "understood", "trace", "clue", "secret", "真相", "发现", "看见", "意识到", "线索", "秘密", "来历", "伏笔", "原来"];
const abstractTerms = ["fate", "destiny", "eternal", "infinite", "grand", "supreme", "legend", "气势", "宏伟", "浩瀚", "无上", "命运", "永恒", "伟岸", "传奇", "震撼"];
const explanatoryTerms = ["because", "therefore", "which meant", "in other words", "所谓", "其实", "因为", "意味着", "也就是说", "这是", "那是", "原来"];
const fakeSuspensePatterns = [/一切才刚刚开始/u, /而这.*只是开始/u, /没有人知道/u, /更大的秘密.*等待/u, /真正的.*才.*开始/u, /only the beginning/i, /just the beginning/i, /no one knew/i, /the real .* had only begun/i];
const summaryEmotionPatterns = [/感到/u, /觉得/u, /内心/u, /心中/u, /不由/u, /emotion/i, /felt\b/i];

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitSentences(content: string): string[] {
  return content
    .split(/[\u3002\uff01\uff1f?!\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countMatches(content: string, terms: string[]): number {
  const lower = content.toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function repeatedSentenceStarts(sentences: string[]): number {
  const starts = new Map<string, number>();
  for (const sentence of sentences) {
    const key = sentence.slice(0, 6).toLowerCase();
    if (!key) continue;
    starts.set(key, (starts.get(key) || 0) + 1);
  }
  return [...starts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}

function paragraphIsExplanatory(paragraph: string): boolean {
  return explanatoryTerms.some((term) => paragraph.toLowerCase().includes(term.toLowerCase()));
}

function paragraphHasSummaryEmotion(paragraph: string): boolean {
  return summaryEmotionPatterns.some((pattern) => pattern.test(paragraph));
}

function paragraphHasPressure(paragraph: string): boolean {
  return pressureTerms.some((term) => paragraph.toLowerCase().includes(term.toLowerCase()));
}

function paragraphHasReaction(paragraph: string): boolean {
  return reactionTerms.some((term) => paragraph.toLowerCase().includes(term.toLowerCase()));
}

function paragraphHasInformation(paragraph: string): boolean {
  return informationTerms.some((term) => paragraph.toLowerCase().includes(term.toLowerCase()));
}

function paragraphHasFakeSuspense(paragraph: string): boolean {
  return fakeSuspensePatterns.some((pattern) => pattern.test(paragraph));
}

function abstractDensity(content: string): number {
  const compact = content.replace(/\s+/g, "");
  if (!compact.length) return 0;
  return countMatches(content, abstractTerms) / compact.length;
}

function normalizedReport(report: Partial<ChapterQualityReport> | undefined, chapterId: string): ChapterQualityReport | null {
  if (!report) return null;
  const metrics = Array.isArray(report.metrics) ? report.metrics : [];
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const normalizedMetrics = reviewMetrics.map(({ key, label }) => {
    const metric = byKey.get(key);
    return metric && typeof metric.score === "number"
      ? { key, label: metric.label || label, score: clamp(metric.score), note: metric.note || "" }
      : null;
  });
  if (!normalizedMetrics.every(Boolean)) return null;
  return {
    chapterId,
    overallScore: typeof report.overallScore === "number" ? clamp(report.overallScore) : clamp(average(normalizedMetrics.map((metric) => metric!.score))),
    summary: report.summary || "",
    metrics: normalizedMetrics as ChapterQualityMetric[],
    strengths: Array.isArray(report.strengths) ? unique(report.strengths) : [],
    fixes: Array.isArray(report.fixes) ? unique(report.fixes) : [],
    updatedAt: report.updatedAt || new Date().toISOString()
  };
}

function extractOuterFencedJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : null;
}

export function parseAiQualityReview(raw?: string, chapterId?: string): ParsedAiReview | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = extractOuterFencedJson(raw);
  if (fenced && fenced !== trimmed) {
    candidates.push(fenced);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ParsedAiReview &
        Partial<ChapterQualityReport> & {
          chapterId?: string;
          summary?: string;
          strengths?: string[];
          fixes?: string[];
          updatedAt?: string;
        };
      const report =
        parsed.report ||
        ("overallScore" in parsed && "metrics" in parsed
          ? {
              chapterId: parsed.chapterId || chapterId || "",
              overallScore: parsed.overallScore,
              summary: parsed.summary,
              metrics: parsed.metrics,
              strengths: parsed.strengths,
              fixes: parsed.fixes,
              updatedAt: parsed.updatedAt
            }
          : undefined);
      return {
        report,
        topIssues: Array.isArray(parsed.topIssues) ? parsed.topIssues : [],
        antiPatternsHit: Array.isArray(parsed.antiPatternsHit) ? parsed.antiPatternsHit : [],
        openingVerdict: typeof parsed.openingVerdict === "string" ? parsed.openingVerdict : "",
        endingVerdict: typeof parsed.endingVerdict === "string" ? parsed.endingVerdict : "",
        rulesBasedSignals: Array.isArray(parsed.rulesBasedSignals) ? parsed.rulesBasedSignals : []
      };
    } catch {
      continue;
    }
  }
  return null;
}

function rulesOnlyReview(input: RuleReviewInput): QualityReviewOutcome {
  const paragraphs = splitParagraphs(input.content);
  const sentences = splitSentences(input.content);
  const opening = paragraphs.slice(0, 2).join("\n");
  const ending = paragraphs.slice(-2).join("\n");
  const sentenceLengths = sentences.map((sentence) => sentence.replace(/\s+/g, "").length).filter(Boolean);
  const paragraphLengths = paragraphs.map((paragraph) => paragraph.replace(/\s+/g, "").length).filter(Boolean);
  const longParagraphs = paragraphLengths.filter((length) => length > 320).length;
  const explanatoryParagraphs = paragraphs.filter(paragraphIsExplanatory).length;
  const summaryEmotionParagraphs = paragraphs.filter(paragraphHasSummaryEmotion).length;
  const repeatedStarts = repeatedSentenceStarts(sentences);
  const abstractRate = abstractDensity(input.content);
  const openingPressure = paragraphHasPressure(opening);
  const openingReaction = paragraphHasReaction(opening);
  const endingConsequence = paragraphHasPressure(ending) || paragraphHasInformation(ending);
  const fakeSuspenseEnding = paragraphHasFakeSuspense(ending);
  const conflictHits = countMatches(input.content, pressureTerms);
  const reactionHits = countMatches(input.content, reactionTerms);
  const informationHits = countMatches(input.content, informationTerms);
  const hasCombatScale =
    /formation|shockwave|sky|mountain|ruin|cliff|altar|阵|天|山|崖|废墟|断岩|穹苍/i.test(input.content) &&
    /burn|crack|collapse|shatter|roar|烧|裂|崩|碎|塌|震|吼/i.test(input.content);
  const sentenceVariation = sentenceLengths.length > 1 ? Math.max(...sentenceLengths) - Math.min(...sentenceLengths) : 0;
  const paragraphVariation = paragraphLengths.length > 1 ? Math.max(...paragraphLengths) - Math.min(...paragraphLengths) : 0;

  const metrics = new Map<ReviewMetricKey, number>();
  metrics.set("rhythm", clamp(58 + Math.min(18, sentenceVariation / 4) + Math.min(8, paragraphVariation / 20) - longParagraphs * 3 - repeatedStarts * 2));
  metrics.set("conflict", clamp(54 + conflictHits * 4 + (input.dashboard?.mainConflict ? 6 : 0) + ((input.scenes || []).length ? 4 : 0) - explanatoryParagraphs * 2));
  metrics.set("emotion", clamp(52 + reactionHits * 6 + (openingReaction ? 8 : 0) - summaryEmotionParagraphs * 5 - explanatoryParagraphs * 2));
  metrics.set("information", clamp(54 + informationHits * 6 + (paragraphHasInformation(ending) ? 6 : 0) - explanatoryParagraphs * 2));
  metrics.set("prose", clamp(64 + Math.min(12, paragraphs.length * 2) + (hasCombatScale ? 4 : 0) + (openingPressure ? 4 : 0) - longParagraphs * 3 - repeatedStarts * 3 - abstractRate * 1800 - explanatoryParagraphs * 3));
  metrics.set("hook", clamp(60 + (endingConsequence ? 20 : 0) + (fakeSuspenseEnding ? -18 : 0) + (paragraphHasInformation(ending) ? 8 : 0)));
  metrics.set("tension", clamp(50 + (openingPressure ? 16 : 0) + conflictHits * 3 + (hasCombatScale ? 8 : 0) + (endingConsequence ? 8 : 0)));

  const antiPatternsHit = unique([
    !openingPressure ? "opening_without_pressure" : "",
    longParagraphs > 1 ? "overlong_paragraph_drag" : "",
    summaryEmotionParagraphs > 0 ? "summary_style_emotion" : "",
    explanatoryParagraphs > 1 ? "explanation_overload" : "",
    abstractRate > 0.008 ? "hollow_grandeur" : "",
    repeatedStarts > 2 ? "repeated_sentence_starts" : "",
    fakeSuspenseEnding ? "fake_suspense_ending" : ""
  ]);

  const rulesBasedSignals = unique([
    longParagraphs > 0 ? `long paragraphs x${longParagraphs}` : "",
    explanatoryParagraphs > 0 ? `explanatory paragraphs x${explanatoryParagraphs}` : "",
    summaryEmotionParagraphs > 0 ? `summary-style emotion paragraphs x${summaryEmotionParagraphs}` : "",
    repeatedStarts > 0 ? `repeated sentence starts x${repeatedStarts}` : "",
    abstractRate > 0.004 ? `abstract density ${abstractRate.toFixed(3)}` : "",
    hasCombatScale ? "combat scale includes environmental feedback" : "",
    fakeSuspenseEnding ? "ending relies on fake suspense phrasing" : ""
  ]);

  const topIssues = unique([
    !openingPressure ? "Open with immediate pressure, anomaly, hierarchy, and protagonist position instead of warming up with exposition." : "",
    explanatoryParagraphs > 1 ? "Cut inert explanation blocks and convert setup into action, omen, or visible consequence." : "",
    summaryEmotionParagraphs > 0 ? "Replace summary emotion lines with embodied reaction, hesitation, contempt, pain, or sensory distortion." : "",
    !hasCombatScale && /fight|battle|clash|杀|战|轰|阵/u.test(input.content)
      ? "Scale the fight through terrain damage, formation response, bodily cost, and shifting judgment."
      : "",
    !endingConsequence || fakeSuspenseEnding ? "End on concrete aftermath or consequence instead of announcing suspense." : ""
  ]).slice(0, 4);

  const reportMetrics: ChapterQualityMetric[] = reviewMetrics.map(({ key, label }) => ({
    key,
    label,
    score: metrics.get(key) || 0,
    note:
      key === "rhythm"
        ? "Checks sentence and paragraph movement against drag and repetition."
        : key === "conflict"
          ? "Checks visible pressure, opposition, and scene-level obstacle."
          : key === "emotion"
            ? "Checks embodied reaction over summary emotion."
            : key === "information"
              ? "Checks concrete reveal, clue, or consequence."
              : key === "prose"
                ? "Checks specificity, compression, and resistance to hollow grandeur."
                : key === "hook"
                  ? "Checks whether the ending lands consequence."
                  : "Checks opening pressure, cost, and sustained danger."
  }));
  const overallScore = clamp(average(reportMetrics.map((metric) => metric.score)));
  const strengths = reportMetrics
    .filter((metric) => metric.score >= 78)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((metric) => `${metric.label}: ${metric.note}`);
  const fixes = topIssues.length ? topIssues : ["Increase pressure, consequence, and scene specificity."];

  return {
    report: {
      chapterId: input.chapterId,
      overallScore,
      summary:
        overallScore >= (input.targetScore || 85)
          ? "The chapter carries usable pressure and consequence, but still needs polish where the weakest metric indicates."
          : "The chapter is below target because pressure, consequence, and anti-AI discipline are not yet consistent.",
      metrics: reportMetrics,
      strengths,
      fixes,
      updatedAt: new Date().toISOString()
    },
    topIssues,
    antiPatternsHit,
    openingVerdict: openingPressure
      ? "The first screen lands visible pressure and puts the protagonist inside the problem."
      : "The opening does not yet land pressure quickly enough; it needs an omen, hierarchy signal, and immediate protagonist predicament.",
    endingVerdict: endingConsequence && !fakeSuspenseEnding
      ? "The ending leaves a concrete aftershock or consequence rather than floating away."
      : "The ending feels flat or artificially suspenseful; it should land a cost, aftermath, or sharpened consequence.",
    rulesBasedSignals
  };
}

function mergeReports(ruleReport: ChapterQualityReport, aiReport: ChapterQualityReport): ChapterQualityReport {
  const aiByKey = new Map(aiReport.metrics.map((metric) => [metric.key, metric]));
  const metrics = ruleReport.metrics.map((metric) => {
    const aiMetric = aiByKey.get(metric.key);
    if (!aiMetric) return metric;
    return {
      key: metric.key,
      label: metric.label,
      score: clamp(metric.score * 0.1 + aiMetric.score * 0.9),
      note: aiMetric.note || metric.note
    };
  });
  return {
    chapterId: ruleReport.chapterId,
    overallScore: clamp(average(metrics.map((metric) => metric.score)) * 0.2 + aiReport.overallScore * 0.8),
    summary: aiReport.summary || ruleReport.summary,
    metrics,
    strengths: unique([...ruleReport.strengths, ...aiReport.strengths]).slice(0, 4),
    fixes: unique([...aiReport.fixes, ...ruleReport.fixes]).slice(0, 5),
    updatedAt: new Date().toISOString()
  };
}

function mergeOutcomeMetadata(ruleOutcome: QualityReviewOutcome, parsed?: ParsedAiReview | null): Omit<QualityReviewOutcome, "report"> {
  return {
    topIssues: unique([...(parsed?.topIssues || []), ...ruleOutcome.topIssues]).slice(0, 5),
    antiPatternsHit: unique([...(parsed?.antiPatternsHit || []), ...ruleOutcome.antiPatternsHit]),
    openingVerdict: parsed?.openingVerdict || ruleOutcome.openingVerdict,
    endingVerdict: parsed?.endingVerdict || ruleOutcome.endingVerdict,
    rulesBasedSignals: unique([...(ruleOutcome.rulesBasedSignals || []), ...(parsed?.rulesBasedSignals || [])])
  };
}

export function reviewChapterQuality(
  input: RuleReviewInput & {
    aiReviewContent?: string;
    aiReviewSummary?: string;
  }
): QualityReviewOutcome {
  const ruleOutcome = rulesOnlyReview(input);
  const parsed = parseAiQualityReview(input.aiReviewContent, input.chapterId);
  const aiReport = normalizedReport(parsed?.report, input.chapterId);
  if (!aiReport) {
    return {
      report: ruleOutcome.report,
      ...mergeOutcomeMetadata(ruleOutcome, parsed)
    };
  }

  return {
    report: mergeReports(ruleOutcome.report, aiReport),
    ...mergeOutcomeMetadata(ruleOutcome, parsed)
  };
}

export function qualityMeetsTarget(report: ChapterQualityReport, targetScore: number): boolean {
  return report.overallScore >= targetScore && report.metrics.every((metric) => metric.score >= targetScore);
}

export function targetMetricsBelow(report: ChapterQualityReport, targetScore: number): ChapterQualityReport["metrics"] {
  return report.metrics.filter((metric) => metric.score < targetScore);
}
