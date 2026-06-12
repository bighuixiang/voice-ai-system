import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChapterDashboard,
  ChapterFactPatch,
  ChapterQualityReport,
  CharacterStatePatch,
  LedgerEntry,
  NovelProject,
  SceneCard,
  WritingRecapCandidate
} from "./types.js";
import {
  acceptWritingRecapPatches,
  appendWritingRecap,
  buildSeriesQualityMetrics,
  readChapterDashboard,
  readChapterQualityReport,
  readChapterSummary,
  readLedgerEntries,
  readSceneCards,
  readSeriesQualityMetrics,
  saveChapterDashboard,
  saveChapterQualityReport,
  saveChapterSummary,
  saveLedgerEntries,
  saveSceneCards
} from "./writingCockpit.js";

let tempRoot = "";

afterEach(async () => {
  vi.restoreAllMocks();
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

function qualityReport(overrides: Partial<ChapterQualityReport> = {}): ChapterQualityReport {
  return {
    chapterId: "chapter-001",
    overallScore: 82,
    summary: "Readable pressure.",
    metrics: [
      { key: "conflict", label: "Conflict", score: 82, note: "Clear." },
      { key: "rhythm", label: "Rhythm", score: 68, note: "Uneven." }
    ],
    strengths: ["Clear pressure"],
    fixes: ["Sharpen rhythm"],
    updatedAt: "2026-06-11T00:00:00.000Z",
    ...overrides
  };
}

function project(overrides: Partial<NovelProject> = {}): NovelProject {
  return {
    id: "demo",
    slug: "demo",
    title: "Demo",
    genre: "fantasy",
    roughIdea: "",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    lastOpenedChapterId: "chapter-001",
    codex: { command: "codex" },
    chapters: [
      {
        id: "chapter-001",
        title: "Chapter 1",
        outlinePath: "outline/chapter-001.md",
        contentPath: "chapters/chapter-001.md",
        status: "drafted"
      },
      {
        id: "chapter-002",
        title: "Chapter 2",
        outlinePath: "outline/chapter-002.md",
        contentPath: "chapters/chapter-002.md",
        status: "drafted"
      }
    ],
    ...overrides
  };
}

function factPatch(overrides: Partial<ChapterFactPatch> = {}): ChapterFactPatch {
  return {
    id: "fact-1",
    chapterId: "chapter-001",
    fact: "Blood wakes the seal.",
    relatedEntities: ["seal"],
    sourceAnchor: "blood touched the seal",
    status: "pending",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides
  };
}

function characterPatch(overrides: Partial<CharacterStatePatch> = {}): CharacterStatePatch {
  return {
    id: "character-state-1",
    chapterId: "chapter-001",
    characterId: "char-protagonist",
    characterName: "主角",
    before: "Uninjured.",
    after: "Wounded and cautious.",
    cause: "Paid blood to test the clue.",
    relatedEntities: ["seal"],
    status: "pending",
    createdAt: "2026-06-04T00:00:00.000Z",
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

  it("returns a safe default chapter summary when the file is missing", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-summary-"));

    const result = await readChapterSummary(tempRoot, "chapter-001");

    expect(result).toEqual(
      expect.objectContaining({
        chapterId: "chapter-001",
        summary: "",
        keyEvents: [],
        newFacts: [],
        characterStateChanges: [],
        foreshadowingUpdates: [],
        continuityRisks: [],
        powerProgressionUpdates: [],
        acceptedRecapIds: []
      })
    );
    expect(result.updatedAt).toEqual(expect.any(String));
  });

  it("saves chapter summaries and rejects unsafe chapter ids", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-save-summary-"));

    await saveChapterSummary(tempRoot, {
      chapterId: "chapter-001",
      summary: "The clue cost blood.",
      keyEvents: ["The seal answered."],
      newFacts: [factPatch()],
      characterStateChanges: [characterPatch()],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    });
    await expect(saveChapterSummary(tempRoot, { ...(await readChapterSummary(tempRoot, "chapter-001")), chapterId: "../secret" })).rejects.toThrow(/Unsafe/);

    const saved = JSON.parse(await fs.readFile(path.join(tempRoot, "memory", "chapter-summaries", "chapter-001.json"), "utf8"));
    expect(saved.summary).toBe("The clue cost blood.");
  });

  it("saves chapter quality reports and rejects unsafe chapter ids", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-save-quality-"));

    await saveChapterQualityReport(
      tempRoot,
      qualityReport({
        metrics: [
          { key: "conflict", label: "Conflict", score: 82, note: "Clear." },
          { key: "rhythm", label: "Rhythm", score: 68, note: "Uneven." },
          { key: "prose", label: "Prose", score: 90, note: "Distinct voice." }
        ]
      })
    );
    await expect(saveChapterQualityReport(tempRoot, qualityReport({ chapterId: "../secret" }))).rejects.toThrow(/Unsafe/);

    const report = await readChapterQualityReport(tempRoot, "chapter-001");
    expect(report).toMatchObject({ chapterId: "chapter-001", overallScore: 82 });
  });

  it("builds and caches series quality metrics from chapter reports", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-series-quality-"));
    await saveChapterDashboard(tempRoot, dashboard({ wordCount: 1200 }));
    await saveSceneCards(tempRoot, "chapter-001", [scene()]);
    await saveChapterSummary(tempRoot, {
      chapterId: "chapter-001",
      summary: "The clue cost blood.",
      keyEvents: ["The seal answered.", "The protagonist hid the wound."],
      newFacts: [],
      characterStateChanges: [characterPatch({ status: "accepted", after: "Wounded but alert." })],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: ["recap-1"],
      updatedAt: "2026-06-11T00:00:00.000Z"
    });
    await saveChapterQualityReport(
      tempRoot,
      qualityReport({
        metrics: [
          { key: "conflict", label: "Conflict", score: 82, note: "Clear." },
          { key: "rhythm", label: "Rhythm", score: 68, note: "Uneven." },
          { key: "prose", label: "Prose", score: 90, note: "Distinct voice." }
        ]
      })
    );
    await saveLedgerEntries(tempRoot, "foreshadowing", [
      ledgerEntry({
        id: "seal-payoff",
        kind: "foreshadowing",
        title: "Seal payoff",
        status: "open",
        severity: "medium",
        expectedResolutionChapterId: "chapter-001"
      })
    ]);
    await saveChapterDashboard(tempRoot, dashboard({ chapterId: "chapter-002", wordCount: 900 }));
    await saveChapterSummary(tempRoot, {
      chapterId: "chapter-002",
      summary: "The protagonist tests the cost again.",
      keyEvents: ["The wound changes his choices."],
      newFacts: [],
      characterStateChanges: [
        characterPatch({
          id: "character-state-2",
          chapterId: "chapter-002",
          status: "accepted",
          after: "More cautious about the seal.",
          cause: "The second test proved the clue has a recurring price.",
          updatedAt: "2026-06-12T00:00:00.000Z"
        })
      ],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: ["recap-2"],
      updatedAt: "2026-06-12T00:00:00.000Z"
    });
    await saveChapterQualityReport(
      tempRoot,
      qualityReport({
        chapterId: "chapter-002",
        overallScore: 70,
        metrics: [
          { key: "conflict", label: "Conflict", score: 74, note: "Serviceable." },
          { key: "rhythm", label: "Rhythm", score: 58, note: "Slow." },
          { key: "prose", label: "Prose", score: 70, note: "Voice softened." }
        ],
        updatedAt: "2026-06-12T00:00:00.000Z"
      })
    );

    const metrics = await buildSeriesQualityMetrics(tempRoot, project());

    expect(metrics).toMatchObject({
      projectSlug: "demo",
      chapterCount: 2,
      reportCount: 2,
      averageOverallScore: 76
    });
    expect(metrics.metricAverages).toEqual([
      expect.objectContaining({ key: "rhythm", averageScore: 63, reportCount: 2 }),
      expect.objectContaining({ key: "conflict", averageScore: 78, reportCount: 2 }),
      expect.objectContaining({ key: "prose", averageScore: 80, reportCount: 2 })
    ]);
    expect(metrics.weakestChapters[0]).toMatchObject({
      chapterId: "chapter-002",
      chapterTitle: "Chapter 2",
      weakestMetricKey: "rhythm",
      weakestMetricScore: 58
    });
    expect(metrics.rhythmSignals?.[0]).toMatchObject({
      chapterId: "chapter-001",
      rhythmScore: 68,
      wordCount: 1200,
      sceneCount: 1,
      beatCount: 2
    });
    expect(metrics.characterArcSignals?.[0]).toMatchObject({
      characterName: "主角",
      changeCount: 2,
      firstChapterId: "chapter-001",
      lastChapterId: "chapter-002",
      latestState: "More cautious about the seal."
    });
    expect(metrics.qualityTrends?.[0]).toMatchObject({
      key: "overall",
      label: "Overall",
      averageScore: 76,
      latestScore: 70,
      previousScore: 82,
      delta: -12,
      points: [
        expect.objectContaining({ chapterId: "chapter-001", score: 82 }),
        expect.objectContaining({ chapterId: "chapter-002", score: 70 })
      ]
    });
    expect(metrics.qualityTrends?.find((trend) => trend.key === "rhythm")).toMatchObject({
      averageScore: 63,
      latestScore: 58,
      delta: -10
    });
    expect(metrics.tensionCurve?.[0]).toMatchObject({
      chapterId: "chapter-001",
      tensionScore: 78.2,
      conflictScore: 82,
      rhythmScore: 68,
      sceneCount: 1
    });
    expect(metrics.tensionCurve?.[1]).toMatchObject({
      chapterId: "chapter-002",
      tensionScore: 69.6
    });
    expect(metrics.styleDriftSignals?.[0]).toMatchObject({
      chapterId: "chapter-002",
      proseScore: 70,
      baselineScore: 80,
      drift: -10,
      severity: "watch",
      note: "Voice softened."
    });
    expect(metrics.narrativeDebtSignals?.[0]).toMatchObject({
      chapterId: "chapter-001",
      debtCount: 1,
      openForeshadowingCount: 1,
      overdueCount: 1,
      severity: "blocked"
    });

    const saved = JSON.parse(await fs.readFile(path.join(tempRoot, "quality", "series-metrics.json"), "utf8"));
    expect(saved.averageOverallScore).toBe(76);
    expect(saved.rhythmSignals[0].chapterId).toBe("chapter-001");
    expect(saved.characterArcSignals[0].characterName).toBe("主角");
    expect(saved.qualityTrends[0].key).toBe("overall");
    expect(saved.tensionCurve[0].tensionScore).toBe(78.2);
    expect(saved.styleDriftSignals[0].chapterId).toBe("chapter-002");
    expect(saved.narrativeDebtSignals[0].chapterId).toBe("chapter-001");
    await expect(readSeriesQualityMetrics(tempRoot, project())).resolves.toMatchObject({ reportCount: 2 });
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

  it("accepts recap patches into chapter memory and structured ledgers", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-accept-recap-"));
    await saveLedgerEntries(tempRoot, "risk", [ledgerEntry({ id: "risk-existing", note: "Already known." })]);
    const recap: WritingRecapCandidate = {
      chapterId: "chapter-001",
      summary: "The clue cost blood.",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [ledgerEntry({ id: "power-1", kind: "power", title: "Painful response" })],
      createdAt: "2026-06-04T00:00:00.000Z",
      summaryPatch: {
        summary: "The protagonist learned the seal answers blood.",
        keyEvents: ["Blood touched the seal.", "The seal answered."]
      },
      emotionLedgerPatch: {
        wounds: [
          {
            id: "emotion-wound-1",
            chapterId: "chapter-001",
            characterName: "Hero",
            description: "Pain now means the seal is listening.",
            cause: "Blood touched the seal.",
            status: "open",
            relatedEntities: ["seal"],
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        ],
        openLoops: [
          {
            id: "emotion-loop-1",
            chapterId: "chapter-001",
            characterName: "Hero",
            description: "He still needs to know who taught the seal to answer blood.",
            cause: "The seal answered with intent.",
            status: "open",
            relatedEntities: ["seal"],
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        ]
      },
      factPatches: [factPatch()],
      characterStatePatches: [characterPatch()],
      ledgerPatches: [ledgerEntry({ id: "foreshadowing-1", kind: "foreshadowing", title: "Blood key" })],
      riskPatches: [ledgerEntry({ id: "risk-1", kind: "risk", title: "POV boundary" })]
    };

    const summary = await acceptWritingRecapPatches(tempRoot, recap);

    expect(summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "The protagonist learned the seal answers blood.",
      keyEvents: ["Blood touched the seal.", "The seal answered."]
    });
    expect(summary.newFacts[0]).toMatchObject({ id: "fact-1", status: "accepted" });
    expect(summary.characterStateChanges[0]).toMatchObject({ id: "character-state-1", status: "accepted" });
    expect(summary.emotionLedger?.wounds[0]).toMatchObject({ id: "emotion-wound-1", description: "Pain now means the seal is listening." });
    expect(summary.emotionLedger?.openLoops[0]).toMatchObject({ id: "emotion-loop-1", status: "open" });
    expect(summary.foreshadowingUpdates.map((entry) => entry.id)).toEqual(["foreshadowing-1"]);
    expect(summary.continuityRisks.map((entry) => entry.id)).toEqual(["risk-1"]);
    expect(summary.powerProgressionUpdates.map((entry) => entry.id)).toEqual(["power-1"]);
    await expect(readLedgerEntries(tempRoot, "foreshadowing")).resolves.toEqual([
      expect.objectContaining({ id: "foreshadowing-1", kind: "foreshadowing" })
    ]);
    await expect(readLedgerEntries(tempRoot, "risk")).resolves.toEqual([
      expect.objectContaining({ id: "risk-existing" }),
      expect.objectContaining({ id: "risk-1", kind: "risk" })
    ]);
    await expect(readLedgerEntries(tempRoot, "power")).resolves.toEqual([
      expect.objectContaining({ id: "power-1", kind: "power" })
    ]);
    const lines = (await fs.readFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "utf8")).trim().split(/\r?\n/);
    expect(lines.map((line) => JSON.parse(line).summary)).toEqual(["The clue cost blood."]);
  });

  it("preserves existing recap log lines when accepting recap patches", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-accept-recap-log-"));
    await fs.mkdir(path.join(tempRoot, "tasks"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "not-json\n", "utf8");

    await acceptWritingRecapPatches(tempRoot, {
      chapterId: "chapter-001",
      summary: "The clue cost blood.",
      newFacts: ["Blood wakes the seal."],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-04T00:00:00.000Z"
    });

    const lines = (await fs.readFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "utf8")).trim().split(/\r?\n/);
    expect(lines[0]).toBe("not-json");
    expect(JSON.parse(lines[1]).summary).toBe("The clue cost blood.");
  });

  it("rolls back recap acceptance writes if a later transaction commit fails", async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writing-cockpit-accept-recap-rollback-"));
    await saveChapterSummary(tempRoot, {
      chapterId: "chapter-001",
      summary: "Original summary.",
      keyEvents: ["Original event."],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    });
    await saveLedgerEntries(tempRoot, "risk", [ledgerEntry({ id: "risk-original", note: "Original risk." })]);
    await fs.mkdir(path.join(tempRoot, "tasks"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "previous-recap\n", "utf8");
    const summaryBefore = await fs.readFile(path.join(tempRoot, "memory", "chapter-summaries", "chapter-001.json"), "utf8");
    const riskBefore = await fs.readFile(path.join(tempRoot, "ledger", "risks.json"), "utf8");
    const recapBefore = await fs.readFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "utf8");
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to).endsWith(`${path.sep}tasks${path.sep}recaps.jsonl`)) {
        throw new Error("simulated recap commit failure");
      }
      await realRename(from, to);
    });

    await expect(
      acceptWritingRecapPatches(tempRoot, {
        chapterId: "chapter-001",
        summary: "Changed summary.",
        newFacts: [],
        characterStateChanges: [],
        foreshadowingUpdates: [],
        continuityRisks: [],
        powerProgressionUpdates: [],
        riskPatches: [ledgerEntry({ id: "risk-new", note: "New risk." })],
        createdAt: "2026-06-04T00:00:00.000Z"
      })
    ).rejects.toThrow("simulated recap commit failure");

    await expect(fs.readFile(path.join(tempRoot, "memory", "chapter-summaries", "chapter-001.json"), "utf8")).resolves.toBe(summaryBefore);
    await expect(fs.readFile(path.join(tempRoot, "ledger", "risks.json"), "utf8")).resolves.toBe(riskBefore);
    await expect(fs.readFile(path.join(tempRoot, "tasks", "recaps.jsonl"), "utf8")).resolves.toBe(recapBefore);
  });
});
