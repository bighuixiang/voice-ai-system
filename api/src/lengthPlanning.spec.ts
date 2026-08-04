import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertLengthContractIntegrity, buildLengthForecast, createLengthContract, decideLengthVariance, readLengthContract, readLengthForecast, readLengthVarianceDecision } from "./lengthPlanning.js";
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

  it("persists a forecast and fails closed when its contract or forecast is tampered", async () => {
    const root = await makeRoot();
    const contract = await createLengthContract(root, project.slug, {
      dimensions: { totalWords: { mode: "soft", min: 100, max: 200 }, totalChapters: { mode: "soft", min: 1, max: 3 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 50, max: 150 } }
    });
    const forecast = await buildLengthForecast(root, project, contract);
    const replay = await buildLengthForecast(root, project, contract);
    expect(replay.fingerprint).toBe(forecast.fingerprint);
    expect(await readLengthForecast(root)).toEqual(replay);
    const forecastPath = path.join(root, "planning", "length-forecast.json");
    const tamperedForecast = JSON.parse(await fs.readFile(forecastPath, "utf8")) as Record<string, unknown>;
    tamperedForecast.status = "within-range";
    await fs.writeFile(forecastPath, JSON.stringify(tamperedForecast), "utf8");
    await expect(readLengthForecast(root)).rejects.toThrow("LENGTH_FORECAST_INTEGRITY_FAILED");

    const contractPath = path.join(root, "planning", "length-contract.json");
    const tamperedContract = JSON.parse(await fs.readFile(contractPath, "utf8")) as Record<string, unknown>;
    tamperedContract.projectSlug = "other-project";
    await fs.writeFile(contractPath, JSON.stringify(tamperedContract), "utf8");
    await expect(readLengthContract(root)).rejects.toThrow("LENGTH_CONTRACT_INTEGRITY_FAILED");
  });

  it("persists variance decisions idempotently and rejects a mismatched forecast", async () => {
    const root = await makeRoot();
    const contract = await createLengthContract(root, project.slug, {
      dimensions: { totalWords: { mode: "soft", min: 100, max: 105 }, totalChapters: { mode: "soft", min: 2, max: 3 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 50, max: 80 } }
    });
    const forecast = await buildLengthForecast(root, project, contract);
    const first = await decideLengthVariance(root, contract, forecast, { authority: "author", choice: "pause-and-review" });
    expect(await readLengthVarianceDecision(root, first.decisionId)).toEqual(first);
    const second = await decideLengthVariance(root, contract, forecast, { authority: "author", choice: "pause-and-review" });
    expect(second).toEqual(first);
    await expect(decideLengthVariance(root, contract, { ...forecast, fingerprint: "f".repeat(64) }, { authority: "author", choice: "pause-and-review" })).rejects.toThrow("LENGTH_FORECAST_INTEGRITY_MISMATCH");
  });
  it("rejects a re-signed contract with invalid dimensions or hard locks", async () => { const root = await makeRoot(); const contract = await createLengthContract(root, project.slug, { dimensions: { totalWords: { mode: "soft", min: 100, max: 200 }, totalChapters: { mode: "unknown" }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 50, max: 100 } }, hardLocks: [] }); const { fingerprint: _fingerprint, ...base } = contract; const invalidBase = { ...base, hardLocks: ["totalWords"], dimensions: { ...base.dimensions, totalWords: { mode: "soft", min: 100, max: 200 } } }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertLengthContractIntegrity(invalid as typeof contract)).toThrow("LENGTH_CONTRACT_INTEGRITY_FAILED"); });

  it("fails closed with the contract error for malformed dimensions and timestamps", async () => {
    const root = await makeRoot();
    const contract = await createLengthContract(root, project.slug, { dimensions: { totalWords: { mode: "soft", min: 100, max: 200 } }, hardLocks: [] });
    const { fingerprint: _fingerprint, ...base } = contract;
    const malformedBase = { ...base, dimensions: undefined, createdAt: "not-a-timestamp" };
    const malformed = { ...malformedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(malformedBase)).digest("hex") };
    expect(() => assertLengthContractIntegrity(malformed as typeof contract)).toThrow("LENGTH_CONTRACT_INTEGRITY_FAILED");
  });
});
