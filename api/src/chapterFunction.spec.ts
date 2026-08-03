import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertChapterFunctionIntegrity, createChapterFunctionContract, listChapterFunctionContracts, readChapterFunctionContract } from "./chapterFunction.js";

const input = (root: string, chapterId = "chapter-001") => ({ root, projectSlug: "demo", chapterId, primaryFunction: "force the hero to choose", secondaryFunctions: ["reveal a cost"], sceneState: "gate under watch", localGoal: "warn ally", obstacle: "patrol closes in", choice: "stay and warn", observableChange: "ally receives route", readerPayoff: "trust gains weight", mustRemember: ["route is exposed"], mustNotReveal: ["who ordered patrol"], sourceRefs: ["outline://chapter-001"] });

describe("chapter function contract", () => {
  it("stores one primary and bounded secondary functions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-function-"));
    const chapter = await createChapterFunctionContract(input(root));
    expect(chapter.schemaVersion).toBe("chapter-function-contract.v1");
    expect(chapter.secondaryFunctions).toHaveLength(1);
    expect(chapter.status).toBe("candidate");
    expect(await readChapterFunctionContract(root, chapter.chapterId)).toEqual(chapter);
  });

  it("is idempotent and isolates projects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-function-"));
    const chapter = await createChapterFunctionContract(input(root));
    expect(await createChapterFunctionContract(input(root))).toEqual(chapter);
    expect(await listChapterFunctionContracts(root, "other")).toEqual([]);
    expect(await listChapterFunctionContracts(root, "demo")).toHaveLength(1);
  });

  it("rejects more than two secondary functions or missing observable change", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-function-"));
    await expect(createChapterFunctionContract({ ...input(root), secondaryFunctions: ["a", "b", "c"] })).rejects.toThrow("CHAPTER_FUNCTION_SECONDARY_LIMIT");
    await expect(createChapterFunctionContract({ ...input(root), observableChange: "" })).rejects.toThrow("CHAPTER_FUNCTION_CHANGE_REQUIRED");
  });

  it("fails closed when a persisted chapter function contract is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-function-tamper-"));
    const chapter = await createChapterFunctionContract(input(root));
    const target = path.join(root, "sessions", "chapter-functions", `${chapter.chapterId}.json`);
    const tampered = { ...chapter, readerPayoff: "changed", fingerprint: "f".repeat(64) };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readChapterFunctionContract(root, chapter.chapterId)).rejects.toThrow("CHAPTER_FUNCTION_INTEGRITY_FAILED");
    await expect(listChapterFunctionContracts(root, "demo")).rejects.toThrow("CHAPTER_FUNCTION_INTEGRITY_FAILED");
    expect(() => assertChapterFunctionIntegrity(tampered, chapter.chapterId)).toThrow("CHAPTER_FUNCTION_INTEGRITY_FAILED");
  });
});
