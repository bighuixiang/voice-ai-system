import type { ChapterQualityMetric, ChapterQualityReport, NovelChapter, NovelProject } from "@/types/novel";

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length || 0;
}

export function scoreMetric(score: number, strongNote: string, weakNote: string): { score: number; note: string } {
  const finalScore = clampScore(score);
  return {
    score: finalScore,
    note: finalScore >= 72 ? strongNote : weakNote
  };
}

export function chapterOrdinal(project: NovelProject | null, chapter: NovelChapter | null): number | undefined {
  if (!chapter) return undefined;
  if (typeof chapter.order === "number" && chapter.order > 0) return chapter.order;
  const index = project?.chapters.findIndex((item) => item.id === chapter.id) ?? -1;
  if (index >= 0) return index + 1;
  const digitMatch = `${chapter.id} ${chapter.title}`.match(/(\d+)/);
  return digitMatch ? Number(digitMatch[1]) : undefined;
}

export function macroPacingGuardrails(content: string, ordinal?: number): string[] {
  if (ordinal && ordinal > 12) return [];
  const revealOverload = countMatches(content, /真相|秘密|来历|身份|规则|幕后|答案|原来|全部|彻底|终于明白/g);
  const finalitySignals = countMatches(content, /真相大白|尘埃落定|彻底解决|再无阻碍|完全掌握|洗清|平反|终结|结束了/g);
  const cleanExitSignals = countMatches(content, /敌人退去|反派退去|毫无代价|没有代价|轻易解决|直接解决|不再威胁/g);
  const risks: string[] = [];
  if (revealOverload >= 5) risks.push("前期真相释放过载，建议只揭一角，把答案拆成后续章节的代价和误判。");
  if (finalitySignals >= 2) risks.push("前期出现终局感表达，建议保留未解压力，避免让主线问题过早落地。");
  if (cleanExitSignals >= 1) risks.push("核心阻力退场过轻，建议补上代价、伤痕或新的追索关系。");
  return risks;
}

interface AnalyzeChapterQualityInput {
  chapterId: string;
  content: string;
  narrativeDebtRisks?: string[];
  ordinal?: number;
}

export function analyzeChapterQuality(input: AnalyzeChapterQualityInput): ChapterQualityReport {
  const units = input.content
    .replace(/\r/g, "\n")
    .split(/[\n。！？?!]+/)
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter((unit) => unit.length >= 4);
  const wordCount = input.content.replace(/\s+/g, "").length;
  const averageUnitLength = units.length ? wordCount / units.length : wordCount;
  const conflictCount = countMatches(input.content, /冲突|危险|代价|必须|不能|暴露|失去|选择|退路|阻力/g);
  const emotionCount = countMatches(input.content, /心|怒|痛|惊|恨|冷|热|沉默|犹豫|颤|哽|怕/g);
  const sensoryCount = countMatches(input.content, /看|听|闻|触|风|雨|血|光|影|声|冷|热|疼/g);
  const infoCount = countMatches(input.content, /知道|发现|明白|秘密|线索|真相|身份|规则|封印|来历/g);
  const hookCount = countMatches(units[units.length - 1] || "", /[？?]|必须|忽然|突然|出现|回应|选择|后果/g);
  const abstractCount = countMatches(input.content, /命运|世界|强大|震撼|恐怖|可怕|无比|极其|非常|深深/g);

  const rhythm = scoreMetric(
    88 - Math.abs(averageUnitLength - 28) * 1.6,
    "句段长短有变化，阅读推进感较稳。",
    "句段节奏偏单一，适合拆出动作、反应和停顿。"
  );
  const conflict = scoreMetric(
    45 + conflictCount * 13,
    "阻力和代价已经进入文本。",
    "冲突信号偏弱，需要让主角面对明确阻力。"
  );
  const emotion = scoreMetric(
    42 + emotionCount * 7 + sensoryCount * 3,
    "情绪与感官描写能支撑场面。",
    "情绪还偏外部，可以补角色的犹豫、压抑或身体反应。"
  );
  const information = scoreMetric(
    48 + infoCount * 9,
    "本章有信息释放，读者能获得推进。",
    "信息推进偏少，可以安排一个新线索或规则露面。"
  );
  const prose = scoreMetric(
    82 - abstractCount * 6 + sensoryCount * 2,
    "文字有具体画面，AI 味不重。",
    "抽象判断词偏多，建议换成动作、感官和选择。"
  );
  const hook = scoreMetric(
    50 + hookCount * 18,
    "结尾具备翻页牵引。",
    "结尾钩子偏平，可以留下新问题、后果或未完成选择。"
  );
  const tension = scoreMetric(
    conflict.score * 0.35 + emotion.score * 0.25 + hook.score * 0.25 + rhythm.score * 0.15,
    "情节、情绪、节奏和钩子形成了有效张力。",
    "张力链条偏松，建议把阻力、代价、情绪反应和结尾悬念串成同一个压力源。"
  );

  const metrics: ChapterQualityMetric[] = [
    { key: "rhythm", label: "节奏", ...rhythm },
    { key: "conflict", label: "冲突", ...conflict },
    { key: "emotion", label: "情绪", ...emotion },
    { key: "information", label: "信息", ...information },
    { key: "prose", label: "文笔", ...prose },
    { key: "hook", label: "钩子", ...hook },
    { key: "tension", label: "张力", ...tension }
  ];

  const macroPacingRisks = macroPacingGuardrails(input.content, input.ordinal);
  if (macroPacingRisks.length) {
    const informationMetric = metrics.find((metric) => metric.key === "information");
    if (informationMetric) {
      informationMetric.score = clampScore(informationMetric.score - macroPacingRisks.length * 8);
      informationMetric.note = `${informationMetric.note} 宏观节奏风险：${macroPacingRisks[0]}`;
    }
  }

  if (input.narrativeDebtRisks?.length) {
    const tensionMetric = metrics.find((metric) => metric.key === "tension");
    if (tensionMetric) {
      tensionMetric.score = clampScore(tensionMetric.score - input.narrativeDebtRisks.length * 5);
      tensionMetric.note = `${tensionMetric.note} 叙事债务：${input.narrativeDebtRisks[0]}`;
    }
  }

  const overallScore = clampScore(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
  const lowMetrics = [...metrics].sort((left, right) => left.score - right.score).slice(0, 2);
  const highMetrics = metrics.filter((metric) => metric.score >= 72).slice(0, 2);
  const fixes = [...lowMetrics.map((metric) => `${metric.label}：${metric.note}`), ...macroPacingRisks.map((risk) => `宏观节奏：${risk}`)];

  fixes.push(...(input.narrativeDebtRisks || []).map((risk) => `叙事债务：${risk}`));

  return {
    chapterId: input.chapterId,
    overallScore,
    summary:
      overallScore >= 75
        ? "这一章的基础驱动力已经成立，下一步重点是把亮点写得更锋利。"
        : "这一章有可用骨架，但还需要补强读者继续读下去的压力和质感。",
    metrics,
    strengths: highMetrics.length ? highMetrics.map((metric) => `${metric.label}：${metric.note}`) : ["已有正文基础，可以继续向冲突和钩子集中。"],
    fixes,
    updatedAt: new Date().toISOString()
  };
}
