import fs from "node:fs/promises";
import path from "node:path";
import type { ChapterDashboard, LedgerEntry, SceneCard, WritingRecapCandidate } from "./types.js";
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
