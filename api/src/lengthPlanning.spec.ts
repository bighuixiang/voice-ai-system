import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildLengthForecast, createLengthContract, decideLengthVariance, readLengthContract } from "./lengthPlanning.js";
import { createNarrativeObligation } from "./narrativeObligation.js";
import type { NovelProject } from "./types.js";

const roots: string[] = [];
const project: NovelProject = {
  id: "p1", slug: "length-demo", title: "Length Demo", genre: "fantasy", roughIdea: "A story", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastOpenedChapterId: "chapter-001", codex: { command: "codex" },
  chapters: [
    { id: "chapter-001", title: "One", outlinePath: "outline/chapter-001.md", contentPath: "chapters/chapter-001.md", status: "drafted", volumeId: "v1" },
    { id: "chapter-002", title: "Two", outlinePath: "outline/chapter-002.md", contentPath: "chapters/chapter-002.md", status: "empty", volumeId: "v1" }
  ]
};

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "length-planning-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "chapters"), { recursive: true });
  await fs.writeFile(path.join(root, project.chapters[0].contentPath), "a".repeat(120), "utf8");
  return root;
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("length planning", () => {
  it("persists obligation-led soft ranges and preserves hard-lock precedence", async () => {
    const root = await makeRoot();
    const contract = await createLengthContract(root, project.slug, {
      dimensions: {
        totalWords: { mode: "soft", min: 100, max: 200 },
        totalChapters: { mode: "hard", exact: 1 },
        totalVolumes: { mode: "unknown" },
        chapterWords: { mode: "soft", min: 50, max: 120 }
      },
      hardLocks: ["totalChapters"]
    });
    expect(contract.pauseThresholdRatio).toBe(0.15);
    expect((await readLengthContract(root))?.fingerprint).toBe(contract.fingerprint);
    const forecast = await buildLengthForecast(root, project, contract);
    expect(forecast.actuals).toMatchObject({ totalWords: 120, totalChapters: 2 });
    expect(forecast.status).toBe("pause-required");
    expect(forecast.blockingReasons).toContain("hard-lock-totalChapters");
  });

  it("creates a variance decision without silently changing the contract", async () => {
    const root = await makeRoot();
    const contract = await createLengthContract(root, project.slug, {
      dimensions: { totalWords: { mode: "soft", min: 100, max: 105 }, totalChapters: { mode: "soft", min: 2, max: 3 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 50, max: 80 } },
      hardLocks: []
    });
    const forecast = await buildLengthForecast(root, project, contract);
    const decision = await decideLengthVariance(root, contract, forecast, { authority: "author", choice: "pause-and-review" });
    expect(decision.status).toBe("paused");
    expect(decision.alternatives.length).toBeGreaterThanOrEqual(2);
    expect((await readLengthContract(root))?.fingerprint).toBe(contract.fingerprint);
  });

  it("reserves an obligation-backed range and exposes its evidence fingerprint", async () => {
    const root = await makeRoot();
    await createNarrativeObligation(root, { projectSlug: project.slug, type: "mystery", title: "Unanswered signal", questionOrPromise: "Why did the lighthouse bell ring?", importance: "high" });
    const contract = await createLengthContract(root, project.slug, {
      dimensions: { totalWords: { mode: "soft", min: 100, max: 150 }, totalChapters: { mode: "soft", min: 1, max: 2 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 80, max: 100 } },
      hardLocks: []
    });
    const forecast = await buildLengthForecast(root, project, contract);
    expect(forecast.obligationSummary).toMatchObject({ total: 1, open: 1, highImportanceOpen: 1 });
    expect(forecast.obligationSummary.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(forecast.assumptions.some((assumption) => assumption.includes("open obligation"))).toBe(true);
    expect(forecast.blockingReasons).toContain("open-obligations-outside-range");
  });
});
