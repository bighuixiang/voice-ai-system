import fs from "node:fs/promises";
import path from "node:path";
import type { ChapterDashboard, LedgerEntry, SceneCard, StoryControl, WritingRecapCandidate } from "./types.js";
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

function storyControlPath(): string {
  return "story-control/story-control.json";
}

function ledgerPath(kind: LedgerKind): string {
  return ledgerPaths[kind];
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
