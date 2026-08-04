import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmStoryBlueprint,
  generateStoryBlueprint,
  readLatestStoryBlueprint,
  reviseStoryBlueprint
} from "./storyBlueprint.js";

async function writeContractCandidate(root: string): Promise<void> {
  const candidate = {
    schemaVersion: "story-contract-candidate.v1",
    candidateId: "contract-candidate-final",
    projectSlug: "blueprint-demo",
    status: "candidate",
    sourceDecisionId: "decision-ending",
    sourceFingerprint: "a".repeat(64),
    fields: [
      { sourceDecisionId: "decision-desire", path: "protagonist.primaryDesire", value: "找回被潮汐偷走的名字" },
      { sourceDecisionId: "decision-conflict", path: "conflict.core", value: "海底城邦要求守门人以记忆交换通行权" },
      { sourceDecisionId: "decision-cost", path: "stakes.failureCost", value: "失败会让故乡永远沉入海底" },
      { sourceDecisionId: "decision-rule", path: "world.rules.primary", value: "每次穿过潮门都会遗失一段最珍贵的记忆" },
      { sourceDecisionId: "decision-promise", path: "readerPromise", value: "在谜团与抉择中见证身份的回归" },
      { sourceDecisionId: "decision-ending", path: "endingDirection", value: "主角保住故乡，却主动留下自己的名字" }
    ],
    contract: {
      protagonist: { primaryDesire: "找回被潮汐偷走的名字", innerNeed: "承认自己曾逃离责任", misbelief: "失去记忆就能逃避选择" },
      conflict: { core: "海底城邦要求守门人以记忆交换通行权", opposingPressure: "城邦执政者想借潮门统治陆地" },
      stakes: { failureCost: "失败会让故乡永远沉入海底", irreversibleChoice: "必须在故乡与自己的名字之间选择" },
      world: { primaryRule: "每次穿过潮门都会遗失一段最珍贵的记忆" },
      readerPromise: "在谜团与抉择中见证身份的回归",
      endingDirection: "主角保住故乡，却主动留下自己的名字"
    },
    fingerprint: "b".repeat(64)
  };
  const directory = path.join(root, "sessions", "contract-candidates");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${candidate.candidateId}.json`), JSON.stringify(candidate), "utf8");
}

describe("story blueprint candidates", () => {
  it("generates a Chinese one-page blueprint from the story-contract candidate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-blueprint-"));
    await writeContractCandidate(root);

    const result = await generateStoryBlueprint({ root, projectSlug: "blueprint-demo", sourceContractCandidateId: "contract-candidate-final" });

    expect(result.blueprint).toMatchObject({
      projectSlug: "blueprint-demo",
      sourceContractCandidateId: "contract-candidate-final",
      sourceFingerprint: "b".repeat(64),
      decisionIds: expect.arrayContaining(["decision-desire", "decision-ending"]),
      content: {
        storyPremise: expect.stringContaining("守门人"),
        openingImage: expect.any(String),
        protagonistGoal: "找回被潮汐偷走的名字",
        coreConflict: "海底城邦要求守门人以记忆交换通行权",
        failureCost: "失败会让故乡永远沉入海底",
        worldRules: "每次穿过潮门都会遗失一段最珍贵的记忆",
        readerPromise: "在谜团与抉择中见证身份的回归",
        endingDirection: "主角保住故乡，却主动留下自己的名字"
      }
    });
    expect(result.blueprint.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(readLatestStoryBlueprint(root, "blueprint-demo")).resolves.toEqual(result.blueprint);
  });

  it("revises by creating a new immutable version and rejects a stale fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-blueprint-"));
    await writeContractCandidate(root);
    const original = (await generateStoryBlueprint({ root, projectSlug: "blueprint-demo", sourceContractCandidateId: "contract-candidate-final" })).blueprint;

    const revision = await reviseStoryBlueprint({
      root,
      projectSlug: "blueprint-demo",
      blueprintId: original.blueprintId,
      expectedFingerprint: original.fingerprint,
      content: { ...original.content, openingImage: "暴雨夜，失忆的守门人在退潮后的礁石上听见自己的名字。" }
    });

    expect(revision.blueprint).toMatchObject({ revisedFrom: original.blueprintId, content: { openingImage: "暴雨夜，失忆的守门人在退潮后的礁石上听见自己的名字。" } });
    expect(revision.blueprint.blueprintId).not.toBe(original.blueprintId);
    const originalJson = JSON.parse(await fs.readFile(path.join(root, "sessions", "story-blueprints", `${original.blueprintId}.json`), "utf8"));
    expect(originalJson).toEqual(original);
    await expect(reviseStoryBlueprint({ root, projectSlug: "blueprint-demo", blueprintId: original.blueprintId, expectedFingerprint: "stale", content: original.content })).rejects.toThrow("STORY_BLUEPRINT_FINGERPRINT_STALE");
  });

  it("records confirmation independently for the selected blueprint only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-blueprint-"));
    await writeContractCandidate(root);
    const original = (await generateStoryBlueprint({ root, projectSlug: "blueprint-demo", sourceContractCandidateId: "contract-candidate-final" })).blueprint;
    const revised = (await reviseStoryBlueprint({ root, projectSlug: "blueprint-demo", blueprintId: original.blueprintId, expectedFingerprint: original.fingerprint, content: { ...original.content, readerPromise: "读者将跟随主角在每次失忆后重新判断真相。" } })).blueprint;

    const confirmation = await confirmStoryBlueprint({ root, projectSlug: "blueprint-demo", blueprintId: revised.blueprintId, expectedFingerprint: revised.fingerprint, actorId: "author-1" });

    expect(confirmation.confirmation).toMatchObject({ blueprintId: revised.blueprintId, blueprintFingerprint: revised.fingerprint, actorId: "author-1", status: "confirmed" });
    await expect(fs.access(path.join(root, "sessions", "story-blueprint-confirmations", `${original.blueprintId}.json`))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
