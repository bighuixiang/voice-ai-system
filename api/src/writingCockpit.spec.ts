import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChapterDashboard, LedgerEntry, SceneCard, WritingRecapCandidate } from "./types.js";
import {
  appendWritingRecap,
  readChapterDashboard,
  readLedgerEntries,
  readSceneCards,
  saveChapterDashboard,
  saveLedgerEntries,
  saveSceneCards
} from "./writingCockpit.js";

let tempRoot = "";

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
});

function dashboard(overrides: Partial<ChapterDashboard> = {}): ChapterDashboard {
  return {
    chapterId: "chapter-001",
    goal: "Find the cost.",
    pov: "主角",
    mainConflict: "Leave or inspect.",
    endingHook: "The seal answers.",
    wordCount: 1000,
    status: "drafting",
    unresolvedForeshadowingIds: ["foreshadowing-1"],
    continuityRiskIds: ["risk-1"],
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides
  };
}

function scene(overrides: Partial<SceneCard> = {}): SceneCard {
  return {
    id: "scene-1",
    chapterId: "chapter-001",
    order: 1,
    title: "Seal test",
    time: "night",
    location: "九连山",
    pov: "主角",
    characters: ["主角"],
    conflict: "The seal asks for blood.",
    turn: "The clue appears after pain.",
    informationReleased: ["Blood wakes the seal."],
    foreshadowingIds: ["foreshadowing-1"],
    powerProgression: "First response.",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides
  };
}

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "risk-1",
    kind: "risk",
    title: "POV boundary",
    status: "watch",
    severity: "high",
    chapterIds: ["chapter-001"],
    relatedEntities: ["主角"],
    note: "Do not reveal the cosmic label.",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides
  };
}

describe("writingCockpit", () => {
  it("returns a safe default dashboard when the file is missing", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-dashboard-"));

    const result = await readChapterDashboard(tempRoot, "chapter-001");

    expect(result).toEqual(
      expect.objectContaining({
        chapterId: "chapter-001",
        goal: "",
        pov: "",
        mainConflict: "",
        endingHook: "",
        wordCount: 0,
        status: "empty",
        unresolvedForeshadowingIds: [],
        continuityRiskIds: []
      })
    );
    expect(result.updatedAt).toEqual(expect.any(String));
  });

  it("saves dashboards and rejects unsafe chapter ids", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-save-dashboard-"));

    await saveChapterDashboard(tempRoot, dashboard());
    await expect(saveChapterDashboard(tempRoot, dashboard({ chapterId: "../secret" }))).rejects.toThrow(/Unsafe/);

    const saved = JSON.parse(await fs.readFile(path.join(tempRoot, "dashboard", "chapter-001.json"), "utf8"));
    expect(saved.goal).toBe("Find the cost.");
  });

  it("reads scene cards sorted by order", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-scenes-"));
    await fs.mkdir(path.join(tempRoot, "scenes"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "scenes", "chapter-001.json"),
      JSON.stringify([scene({ id: "scene-2", order: 2 }), scene({ id: "scene-1", order: 1 })]),
      "utf8"
    );

    const result = await readSceneCards(tempRoot, "chapter-001");

    expect(result.map((item) => item.id)).toEqual(["scene-1", "scene-2"]);
  });

  it("saves scene cards with normalized order", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-save-scenes-"));

    await saveSceneCards(tempRoot, "chapter-001", [
      scene({ id: "scene-2", order: 9 }),
      scene({ id: "scene-1", order: 2 })
    ]);

    const saved = JSON.parse(await fs.readFile(path.join(tempRoot, "scenes", "chapter-001.json"), "utf8"));
    expect(saved.map((item: SceneCard) => ({ id: item.id, order: item.order }))).toEqual([
      { id: "scene-1", order: 1 },
      { id: "scene-2", order: 2 }
    ]);
  });

  it("reads missing ledgers as empty lists and saves ledger entries", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-ledgers-"));

    await expect(readLedgerEntries(tempRoot, "risk")).resolves.toEqual([]);
    await saveLedgerEntries(tempRoot, "risk", [ledgerEntry()]);

    const result = await readLedgerEntries(tempRoot, "risk");
    expect(result[0].id).toBe("risk-1");
  });

  it("appends writing recap candidates as json lines", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-recaps-"));
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "The clue cost blood.",
      newFacts: ["Blood wakes the seal."],
      characterStateChanges: ["主角受伤"],
      foreshadowingUpdates: [ledgerEntry({ kind: "foreshadowing" })],
      continuityRisks: [ledgerEntry()],
      powerProgressionUpdates: [ledgerEntry({ kind: "power" })],
      createdAt: "2026-06-04T00:00:00.000Z"
    };

    await appendWritingRecap(tempRoot, recap);
    await appendWritingRecap(tempRoot, { ...recap, summary: "Second recap." });

    const lines = (await fs.readFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "utf8")).trim().split(/\r?\n/);
    expect(lines.map((line) => JSON.parse(line).summary)).toEqual(["The clue cost blood.", "Second recap."]);
  });
});
