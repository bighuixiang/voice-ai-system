import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterDashboard,
  ChapterFactPatch,
  ChapterQualityReport,
  ChapterSummary,
  CharacterArcSignal,
  CharacterStatePatch,
  LedgerEntry,
  NovelProject,
  SceneCard,
  SeriesQualityMetricAverage,
  SeriesRhythmSignal,
  SeriesQualityTrend,
  SeriesTensionPoint,
  SeriesStyleDriftSignal,
  SeriesQualityMetrics,
  StoryControl,
  WritingRecapCandidate
} from "./types.js";
import { resolveInside } from "./pathSafety.js";

type LedgerKind = LedgerEntry["kind"];

const ledgerPaths: Record<LedgerKind, string> = {
  foreshadowing: "ledger/foreshadowing.json",
  continuity: "ledger/continuity.json",
  power: "ledger/power-progression.json",
  character: "ledger/character-state.json",
  risk: "ledger/risks.json"
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultDashboard(chapterId: string): ChapterDashboard {
  return {
    chapterId,
    goal: "",
    pov: "",
    mainConflict: "",
    endingHook: "",
    wordCount: 0,
    status: "empty",
    unresolvedForeshadowingIds: [],
    continuityRiskIds: [],
    updatedAt: nowIso()
  };
}

function defaultChapterSummary(chapterId: string): ChapterSummary {
  return {
    chapterId,
    summary: "",
    keyEvents: [],
    newFacts: [],
    characterStateChanges: [],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    acceptedRecapIds: [],
    updatedAt: nowIso()
  };
}

export function defaultStoryControl(): StoryControl {
  const now = nowIso();
  return {
    version: 1,
    premise: "",
    currentArcId: "arc-main-01",
    arcs: [
      {
        id: "arc-main-01",
        title: "主线起步",
        chapterRange: "第 1-10 章",
        goal: "明确主角处境、核心目标和第一轮外部压力。",
        stakes: "如果主角不行动，将失去当前最重要的资源或关系。",
        payoff: "主角完成第一次可信突破，并留下下一阶段更大的问题。",
        status: "seed",
        updatedAt: now
      }
    ],
    characters: [
      {
        id: "char-protagonist",
        name: "主角",
        role: "主角",
        goal: "补全长期目标和短期目标。",
        currentState: "初始状态待补充。",
        knownSecrets: "只记录当前章节前已经知道的信息。",
        relationshipNotes: "记录队友、竞争者、债主或师承关系。",
        powerLevel: "初始能力待补充。",
        status: "seed",
        updatedAt: now
      }
    ],
    events: [
      {
        id: "event-first-dungeon",
        type: "dungeon",
        title: "第一处特殊事件",
        trigger: "主角达到第一个小目标，但需要外部压力迫使他组队行动。",
        participants: ["主角"],
        location: "待定地点",
        conflict: "收益可观，但会暴露主角不该轻易暴露的信息。",
        reward: "能力、资源、关系或线索上的小突破。",
        cost: "留下代价、伤势、债务、敌意或更大的追踪风险。",
        foreshadowing: "提前 2-3 章埋入异常物件、传闻或地图碎片。",
        chapterRange: "待安排",
        status: "seed",
        updatedAt: now
      }
    ],
    orchestrationNotes: "AI 编排未来章节时必须让事件由角色动机和代价触发，避免无因刷副本或突然升级。",
    updatedAt: now
  };
}

async function readJsonFile<T>(root: string, relativePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(resolveInside(root, relativePath), "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function chapterDashboardPath(chapterId: string): string {
  return `dashboard/${chapterId}.json`;
}

function sceneCardsPath(chapterId: string): string {
  return `scenes/${chapterId}.json`;
}

function chapterSummaryPath(chapterId: string): string {
  return `memory/chapter-summaries/${chapterId}.json`;
}

function chapterQualityPath(chapterId: string): string {
  return `quality/${chapterId}.json`;
}

function seriesQualityPath(): string {
  return "quality/series-metrics.json";
}

function storyControlPath(): string {
  return "story-control/story-control.json";
}

function ledgerPath(kind: LedgerKind): string {
  return ledgerPaths[kind];
}

function mergeById<T extends { id: string }>(existing: T[], updates: T[]): T[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  updates.forEach((item) => {
    merged.set(item.id, {
      ...merged.get(item.id),
      ...item
    });
  });
  return Array.from(merged.values());
}

function acceptedFactPatches(patches: ChapterFactPatch[]): ChapterFactPatch[] {
  return patches.map((patch) => ({
    ...patch,
    status: "accepted",
    updatedAt: nowIso()
  }));
}

function acceptedCharacterStatePatches(patches: CharacterStatePatch[]): CharacterStatePatch[] {
  return patches.map((patch) => ({
    ...patch,
    status: "accepted",
    updatedAt: nowIso()
  }));
}

function legacyFactPatches(recap: WritingRecapCandidate): ChapterFactPatch[] {
  return recap.newFacts.map((fact, index) => ({
    id: `fact-${recap.chapterId}-${Date.parse(recap.createdAt) || 0}-${index + 1}`,
    chapterId: recap.chapterId,
    fact,
    relatedEntities: [],
    status: "pending",
    createdAt: recap.createdAt,
    updatedAt: recap.createdAt
  }));
}

function legacyCharacterPatches(recap: WritingRecapCandidate): CharacterStatePatch[] {
  return recap.characterStateChanges.map((change, index) => ({
    id: `character-state-${recap.chapterId}-${Date.parse(recap.createdAt) || 0}-${index + 1}`,
    chapterId: recap.chapterId,
    characterName: "未指定角色",
    after: change,
    cause: recap.summary,
    relatedEntities: [],
    status: "pending",
    createdAt: recap.createdAt,
    updatedAt: recap.createdAt
  }));
}

function recapAcceptanceId(recap: WritingRecapCandidate): string {
  return `${recap.chapterId}:${recap.createdAt}`;
}

export async function readChapterDashboard(root: string, chapterId: string): Promise<ChapterDashboard> {
  return readJsonFile(root, chapterDashboardPath(chapterId), defaultDashboard(chapterId));
}

export async function saveChapterDashboard(root: string, dashboard: ChapterDashboard): Promise<ChapterDashboard> {
  const normalized = {
    ...dashboard,
    updatedAt: dashboard.updatedAt || nowIso()
  };
  await writeJsonFile(root, chapterDashboardPath(dashboard.chapterId), normalized);
  return normalized;
}

export async function readChapterSummary(root: string, chapterId: string): Promise<ChapterSummary> {
  return readJsonFile(root, chapterSummaryPath(chapterId), defaultChapterSummary(chapterId));
}

export async function saveChapterSummary(root: string, summary: ChapterSummary): Promise<ChapterSummary> {
  const normalized: ChapterSummary = {
    ...defaultChapterSummary(summary.chapterId),
    ...summary,
    keyEvents: summary.keyEvents || [],
    newFacts: summary.newFacts || [],
    characterStateChanges: summary.characterStateChanges || [],
    foreshadowingUpdates: summary.foreshadowingUpdates || [],
    continuityRisks: summary.continuityRisks || [],
    powerProgressionUpdates: summary.powerProgressionUpdates || [],
    acceptedRecapIds: summary.acceptedRecapIds || [],
    updatedAt: summary.updatedAt || nowIso()
  };
  await writeJsonFile(root, chapterSummaryPath(summary.chapterId), normalized);
  return normalized;
}

export async function readChapterQualityReport(root: string, chapterId: string): Promise<ChapterQualityReport | null> {
  return readJsonFile<ChapterQualityReport | null>(root, chapterQualityPath(chapterId), null);
}

export async function saveChapterQualityReport(root: string, report: ChapterQualityReport): Promise<ChapterQualityReport> {
  const normalized: ChapterQualityReport = {
    ...report,
    metrics: report.metrics || [],
    strengths: report.strengths || [],
    fixes: report.fixes || [],
    updatedAt: report.updatedAt || nowIso()
  };
  await writeJsonFile(root, chapterQualityPath(report.chapterId), normalized);
  return normalized;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function weakestMetric(report: ChapterQualityReport): ChapterQualityReport["metrics"][number] | undefined {
  return [...report.metrics].sort((left, right) => left.score - right.score)[0];
}

function rhythmMetric(report?: ChapterQualityReport | null): ChapterQualityReport["metrics"][number] | undefined {
  return report?.metrics.find((metric) => metric.key === "rhythm");
}

function qualityMetric(report: ChapterQualityReport | null, key: ChapterQualityReport["metrics"][number]["key"]): ChapterQualityReport["metrics"][number] | undefined {
  return report?.metrics.find((metric) => metric.key === key);
}

function hasRhythmSignal(input: {
  report: ChapterQualityReport | null;
  dashboard: ChapterDashboard;
  scenes: SceneCard[];
  summary: ChapterSummary;
}): boolean {
  return Boolean(rhythmMetric(input.report) || input.dashboard.wordCount || input.scenes.length || input.summary.keyEvents.length);
}

function hasTensionSignal(input: {
  report: ChapterQualityReport | null;
  dashboard: ChapterDashboard;
  scenes: SceneCard[];
  summary: ChapterSummary;
}): boolean {
  return Boolean(input.report || input.dashboard.mainConflict || input.dashboard.endingHook || input.scenes.some((scene) => scene.conflict || scene.turn) || input.summary.keyEvents.length);
}

function buildRhythmSignals(
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    report: ChapterQualityReport | null;
    dashboard: ChapterDashboard;
    scenes: SceneCard[];
    summary: ChapterSummary;
  }>
): SeriesRhythmSignal[] {
  return chapters
    .filter(hasRhythmSignal)
    .map(({ chapter, report, dashboard, scenes, summary }) => {
      const rhythm = rhythmMetric(report);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        rhythmScore: rhythm?.score,
        overallScore: report?.overallScore,
        wordCount: dashboard.wordCount || 0,
        sceneCount: scenes.length,
        beatCount: summary.keyEvents.length,
        note: rhythm?.note || summary.summary || dashboard.goal || "暂无节奏摘要。",
        updatedAt: report?.updatedAt || summary.updatedAt || dashboard.updatedAt
      };
    });
}

function buildCharacterArcSignals(summaries: ChapterSummary[]): CharacterArcSignal[] {
  const grouped = new Map<string, CharacterStatePatch[]>();
  for (const summary of summaries) {
    for (const change of summary.characterStateChanges) {
      if (change.status !== "accepted") continue;
      const name = change.characterName.trim();
      if (!name) continue;
      grouped.set(name, [...(grouped.get(name) || []), change]);
    }
  }

  return Array.from(grouped.entries())
    .map(([characterName, changes]) => {
      const ordered = [...changes].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
      const latest = ordered[ordered.length - 1];
      const chapterIds = Array.from(new Set(ordered.map((change) => change.chapterId)));
      return {
        characterName,
        changeCount: ordered.length,
        chapterIds,
        firstChapterId: chapterIds[0] || latest.chapterId,
        lastChapterId: chapterIds[chapterIds.length - 1] || latest.chapterId,
        latestState: latest.after,
        latestCause: latest.cause,
        updatedAt: latest.updatedAt
      };
    })
    .sort((left, right) => right.changeCount - left.changeCount || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
}

function weightedTensionScore(input: {
  conflict?: number;
  hook?: number;
  emotion?: number;
  rhythm?: number;
  sceneCount: number;
}): number {
  const weighted = [
    { value: input.conflict, weight: 0.4 },
    { value: input.hook, weight: 0.25 },
    { value: input.emotion, weight: 0.2 },
    { value: input.rhythm, weight: 0.15 }
  ].filter((item): item is { value: number; weight: number } => typeof item.value === "number");

  if (weighted.length) {
    const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
    return roundScore(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum);
  }

  return Math.min(85, 45 + input.sceneCount * 8);
}

function buildTensionCurve(
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    report: ChapterQualityReport | null;
    dashboard: ChapterDashboard;
    scenes: SceneCard[];
    summary: ChapterSummary;
  }>
): SeriesTensionPoint[] {
  return chapters
    .filter(hasTensionSignal)
    .map(({ chapter, report, dashboard, scenes, summary }) => {
      const conflict = qualityMetric(report, "conflict");
      const hook = qualityMetric(report, "hook");
      const emotion = qualityMetric(report, "emotion");
      const rhythm = qualityMetric(report, "rhythm");
      const note =
        conflict?.note ||
        hook?.note ||
        dashboard.mainConflict ||
        scenes.find((scene) => scene.conflict || scene.turn)?.conflict ||
        scenes.find((scene) => scene.turn)?.turn ||
        summary.keyEvents[0] ||
        summary.summary ||
        "暂无张力摘要。";

      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        tensionScore: weightedTensionScore({
          conflict: conflict?.score,
          hook: hook?.score,
          emotion: emotion?.score,
          rhythm: rhythm?.score,
          sceneCount: scenes.length
        }),
        conflictScore: conflict?.score,
        hookScore: hook?.score,
        emotionScore: emotion?.score,
        rhythmScore: rhythm?.score,
        sceneCount: scenes.length,
        note,
        updatedAt: report?.updatedAt || dashboard.updatedAt || summary.updatedAt
      };
    });
}

function styleDriftSeverity(drift: number): SeriesStyleDriftSignal["severity"] {
  const magnitude = Math.abs(drift);
  if (magnitude >= 15) return "review";
  if (magnitude >= 8) return "watch";
  return "stable";
}

function buildStyleDriftSignals(
  reports: Array<{ chapter: NovelProject["chapters"][number]; report: ChapterQualityReport }>
): SeriesStyleDriftSignal[] {
  const proseReports = reports
    .map(({ chapter, report }) => ({
      chapter,
      report,
      prose: qualityMetric(report, "prose")
    }))
    .filter((item): item is { chapter: NovelProject["chapters"][number]; report: ChapterQualityReport; prose: ChapterQualityReport["metrics"][number] } =>
      Boolean(item.prose)
    );

  if (proseReports.length < 2) return [];

  const baselineScore = roundScore(proseReports.reduce((sum, item) => sum + item.prose.score, 0) / proseReports.length);
  return proseReports
    .map(({ chapter, report, prose }) => {
      const drift = roundScore(prose.score - baselineScore);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        proseScore: prose.score,
        baselineScore,
        drift,
        severity: styleDriftSeverity(drift),
        note: prose.note,
        updatedAt: report.updatedAt
      };
    })
    .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
}

function buildQualityTrend(
  key: SeriesQualityTrend["key"],
  label: string,
  points: SeriesQualityTrend["points"]
): SeriesQualityTrend | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return {
    key,
    label,
    points,
    averageScore: roundScore(points.reduce((sum, point) => sum + point.score, 0) / points.length),
    latestScore: latest.score,
    previousScore: previous?.score,
    delta: previous ? roundScore(latest.score - previous.score) : undefined
  };
}

function buildQualityTrends(
  reports: Array<{ chapter: NovelProject["chapters"][number]; report: ChapterQualityReport }>
): SeriesQualityTrend[] {
  const overall = buildQualityTrend(
    "overall",
    "Overall",
    reports.map(({ chapter, report }) => ({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      score: report.overallScore,
      updatedAt: report.updatedAt
    }))
  );

  const metricGroups = new Map<
    ChapterQualityReport["metrics"][number]["key"],
    { key: ChapterQualityReport["metrics"][number]["key"]; label: string; points: SeriesQualityTrend["points"] }
  >();

  reports.forEach(({ chapter, report }) => {
    report.metrics.forEach((metric) => {
      const group = metricGroups.get(metric.key) || { key: metric.key, label: metric.label, points: [] };
      group.points.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        score: metric.score,
        updatedAt: report.updatedAt
      });
      metricGroups.set(metric.key, group);
    });
  });

  const metricTrends = Array.from(metricGroups.values())
    .map((group) => buildQualityTrend(group.key, group.label, group.points))
    .filter((trend): trend is SeriesQualityTrend => Boolean(trend))
    .sort((left, right) => left.averageScore - right.averageScore || left.label.localeCompare(right.label));

  return overall ? [overall, ...metricTrends] : metricTrends;
}

export async function buildSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const chapterSignals = await Promise.all(
    project.chapters.map(async (chapter) => {
      const [report, dashboard, scenes, summary] = await Promise.all([
        readChapterQualityReport(root, chapter.id),
        readChapterDashboard(root, chapter.id),
        readSceneCards(root, chapter.id),
        readChapterSummary(root, chapter.id)
      ]);
      return { chapter, report, dashboard, scenes, summary };
    })
  );

  const reports = chapterSignals
    .map(({ chapter, report }) => ({
      chapter,
      report
    }))
    .filter((item): item is { chapter: NovelProject["chapters"][number]; report: ChapterQualityReport } => Boolean(item.report));

  const metricGroups = new Map<string, { key: ChapterQualityReport["metrics"][number]["key"]; label: string; scores: number[] }>();
  reports.forEach(({ report }) => {
    report.metrics.forEach((metric) => {
      const existing = metricGroups.get(metric.key) || { key: metric.key, label: metric.label, scores: [] };
      existing.scores.push(metric.score);
      metricGroups.set(metric.key, existing);
    });
  });

  const metricAverages: SeriesQualityMetricAverage[] = Array.from(metricGroups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      averageScore: roundScore(group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length),
      reportCount: group.scores.length
    }))
    .sort((left, right) => left.averageScore - right.averageScore || left.key.localeCompare(right.key));

  const weakestChapters = reports
    .map(({ chapter, report }) => {
      const weak = weakestMetric(report);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        overallScore: report.overallScore,
        weakestMetricKey: weak?.key,
        weakestMetricLabel: weak?.label,
        weakestMetricScore: weak?.score,
        updatedAt: report.updatedAt
      };
    })
    .sort((left, right) => left.overallScore - right.overallScore)
    .slice(0, 5);

  const metrics: SeriesQualityMetrics = {
    projectSlug: project.slug,
    chapterCount: project.chapters.length,
    reportCount: reports.length,
    averageOverallScore: reports.length
      ? roundScore(reports.reduce((sum, item) => sum + item.report.overallScore, 0) / reports.length)
      : 0,
    metricAverages,
    weakestChapters,
    rhythmSignals: buildRhythmSignals(chapterSignals),
    characterArcSignals: buildCharacterArcSignals(chapterSignals.map((item) => item.summary)),
    qualityTrends: buildQualityTrends(reports),
    tensionCurve: buildTensionCurve(chapterSignals),
    styleDriftSignals: buildStyleDriftSignals(reports),
    updatedAt: nowIso()
  };

  await writeJsonFile(root, seriesQualityPath(), metrics);
  return metrics;
}

export async function readSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const cached = await readJsonFile<SeriesQualityMetrics | null>(root, seriesQualityPath(), null);
  return cached?.rhythmSignals && cached.characterArcSignals && cached.qualityTrends && cached.tensionCurve && cached.styleDriftSignals
    ? cached
    : buildSeriesQualityMetrics(root, project);
}

export async function readSceneCards(root: string, chapterId: string): Promise<SceneCard[]> {
  const cards = await readJsonFile<SceneCard[]>(root, sceneCardsPath(chapterId), []);
  return [...cards].sort((left, right) => left.order - right.order);
}

export async function saveSceneCards(root: string, chapterId: string, cards: SceneCard[]): Promise<SceneCard[]> {
  const normalized = [...cards]
    .sort((left, right) => left.order - right.order)
    .map((card, index) => ({
      ...card,
      chapterId,
      order: index + 1,
      updatedAt: card.updatedAt || nowIso()
    }));
  await writeJsonFile(root, sceneCardsPath(chapterId), normalized);
  return normalized;
}

export async function readStoryControl(root: string): Promise<StoryControl> {
  return readJsonFile(root, storyControlPath(), defaultStoryControl());
}

export async function saveStoryControl(root: string, storyControl: StoryControl): Promise<StoryControl> {
  const normalized: StoryControl = {
    ...storyControl,
    version: 1,
    arcs: storyControl.arcs || [],
    characters: storyControl.characters || [],
    events: storyControl.events || [],
    orchestrationNotes: storyControl.orchestrationNotes || "",
    updatedAt: nowIso()
  };
  await writeJsonFile(root, storyControlPath(), normalized);
  return normalized;
}

export async function readLedgerEntries(root: string, kind: LedgerKind): Promise<LedgerEntry[]> {
  return readJsonFile<LedgerEntry[]>(root, ledgerPath(kind), []);
}

export async function saveLedgerEntries(root: string, kind: LedgerKind, entries: LedgerEntry[]): Promise<LedgerEntry[]> {
  const normalized = entries.map((entry) => ({
    ...entry,
    kind,
    updatedAt: entry.updatedAt || nowIso()
  }));
  await writeJsonFile(root, ledgerPath(kind), normalized);
  return normalized;
}

export async function appendWritingRecap(root: string, recap: WritingRecapCandidate): Promise<void> {
  const target = resolveInside(root, "tasks/recaps.jsonl");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(recap)}\n`, "utf8");
}

export async function acceptWritingRecapPatches(root: string, recap: WritingRecapCandidate): Promise<ChapterSummary> {
  const existingSummary = await readChapterSummary(root, recap.chapterId);
  const acceptedFacts = acceptedFactPatches(recap.factPatches?.length ? recap.factPatches : legacyFactPatches(recap));
  const acceptedCharacters = acceptedCharacterStatePatches(
    recap.characterStatePatches?.length ? recap.characterStatePatches : legacyCharacterPatches(recap)
  );
  const ledgerPatches = mergeById(
    [...recap.foreshadowingUpdates, ...recap.continuityRisks, ...recap.powerProgressionUpdates],
    recap.ledgerPatches || []
  );
  const riskPatches = recap.riskPatches || [];
  const foreshadowingUpdates = ledgerPatches.filter((entry) => entry.kind === "foreshadowing");
  const continuityRisks = [...ledgerPatches.filter((entry) => entry.kind === "continuity"), ...riskPatches];
  const powerProgressionUpdates = ledgerPatches.filter((entry) => entry.kind === "power");
  const acceptanceId = recapAcceptanceId(recap);
  const summaryPatch = recap.summaryPatch || {};
  const nextSummary: ChapterSummary = {
    ...existingSummary,
    ...summaryPatch,
    chapterId: recap.chapterId,
    summary: summaryPatch.summary || recap.summary || existingSummary.summary,
    keyEvents: summaryPatch.keyEvents || existingSummary.keyEvents,
    newFacts: mergeById(existingSummary.newFacts, acceptedFacts),
    characterStateChanges: mergeById(existingSummary.characterStateChanges, acceptedCharacters),
    foreshadowingUpdates: mergeById(existingSummary.foreshadowingUpdates, foreshadowingUpdates),
    continuityRisks: mergeById(existingSummary.continuityRisks, continuityRisks),
    powerProgressionUpdates: mergeById(existingSummary.powerProgressionUpdates, powerProgressionUpdates),
    acceptedRecapIds: Array.from(new Set([...existingSummary.acceptedRecapIds, acceptanceId])),
    updatedAt: nowIso()
  };

  const updatesByKind = [...ledgerPatches, ...riskPatches].reduce<Partial<Record<LedgerKind, LedgerEntry[]>>>(
    (groups, entry) => {
      groups[entry.kind] = [...(groups[entry.kind] || []), entry];
      return groups;
    },
    {}
  );
  for (const [kind, entries] of Object.entries(updatesByKind) as Array<[LedgerKind, LedgerEntry[]]>) {
    const existing = await readLedgerEntries(root, kind);
    await saveLedgerEntries(root, kind, mergeById(existing, entries));
  }

  const savedSummary = await saveChapterSummary(root, nextSummary);
  await appendWritingRecap(root, recap);
  return savedSummary;
}
