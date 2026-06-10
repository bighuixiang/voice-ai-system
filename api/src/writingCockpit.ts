import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterDashboard,
  ChapterFactPatch,
  ChapterQualityReport,
  ChapterSummary,
  CharacterStatePatch,
  LedgerEntry,
  NovelProject,
  SceneCard,
  SeriesQualityMetricAverage,
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

export async function buildSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const reports = (
    await Promise.all(
      project.chapters.map(async (chapter) => ({
        chapter,
        report: await readChapterQualityReport(root, chapter.id)
      }))
    )
  ).filter((item): item is { chapter: NovelProject["chapters"][number]; report: ChapterQualityReport } => Boolean(item.report));

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
    updatedAt: nowIso()
  };

  await writeJsonFile(root, seriesQualityPath(), metrics);
  return metrics;
}

export async function readSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const cached = await readJsonFile<SeriesQualityMetrics | null>(root, seriesQualityPath(), null);
  return cached || buildSeriesQualityMetrics(root, project);
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
