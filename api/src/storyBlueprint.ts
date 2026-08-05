import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate, type StoryContractCandidate } from "./contractCandidate.js";
import { readCreativeSession, withCreativeSessionLock, type CreativeSession } from "./creativeSession.js";

export interface StoryBlueprintContent {
  storyPremise: string;
  openingImage: string;
  protagonistGoal: string;
  coreConflict: string;
  failureCost: string;
  worldRules: string;
  readerPromise: string;
  endingDirection: string;
}

export interface StoryBlueprint {
  schemaVersion: "story-blueprint.v1";
  blueprintId: string;
  projectSlug: string;
  sourceContractCandidateId: string;
  sourceFingerprint: string;
  decisionIds: string[];
  content: StoryBlueprintContent;
  revisedFrom?: string;
  createdAt: string;
  fingerprint: string;
}

export interface StoryBlueprintConfirmation {
  schemaVersion: "story-blueprint-confirmation.v1";
  confirmationId: string;
  projectSlug: string;
  blueprintId: string;
  blueprintFingerprint: string;
  actorId: string;
  status: "confirmed";
  confirmedAt: string;
  authorMessageFingerprint?: string;
  fingerprint: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function authorMessageFingerprint(session: Pick<CreativeSession, "messages">): string {
  return hash(session.messages
    .filter((message) => message.role === "author")
    .map(({ id, clientMessageId, text, createdAt }) => ({ id, clientMessageId, text, createdAt })));
}

function blueprintPath(root: string, blueprintId: string): string {
  return resolveInside(root, `sessions/story-blueprints/${blueprintId}.json`);
}

function confirmationPath(root: string, blueprintId: string): string {
  return resolveInside(root, `sessions/story-blueprint-confirmations/${blueprintId}.json`);
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

function asText(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function buildContent(candidate: StoryContractCandidate): StoryBlueprintContent {
  const { contract } = candidate;
  const protagonistGoal = asText(contract.protagonist.primaryDesire, "明确主角想要达成的目标");
  const coreConflict = asText(contract.conflict.core, "让主角必须作出选择的核心冲突");
  const worldRules = asText(contract.world.primaryRule, "世界规则仍待作者确认");
  const endingDirection = asText(contract.endingDirection, "结局方向仍待作者确认");
  return {
    storyPremise: `一位主角为了${protagonistGoal}，必须在“${coreConflict}”中作出无法回头的选择。`,
    openingImage: `开篇以主角直面“${coreConflict}”的现场切入，让目标与危险同时显形。`,
    protagonistGoal,
    coreConflict,
    failureCost: asText(contract.stakes.failureCost, "失败将失去最重要的人或事物"),
    worldRules,
    readerPromise: asText(contract.readerPromise, "读者将跟随主角逐步逼近真相，并见证选择的代价"),
    endingDirection
  };
}

function createBlueprintId(): string {
  return `story-blueprint-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function signBlueprint(base: Omit<StoryBlueprint, "fingerprint">): StoryBlueprint {
  return { ...base, fingerprint: hash(base) };
}

function assertBlueprintIntegrity(blueprint: StoryBlueprint, expectedProjectSlug?: string): StoryBlueprint {
  const { fingerprint: _fingerprint, ...base } = blueprint;
  const content = blueprint.content;
  const valid = blueprint.schemaVersion === "story-blueprint.v1"
    && (!expectedProjectSlug || blueprint.projectSlug === expectedProjectSlug)
    && Boolean(blueprint.blueprintId?.trim() && blueprint.projectSlug?.trim() && blueprint.sourceContractCandidateId?.trim())
    && /^[a-f0-9]{64}$/i.test(blueprint.sourceFingerprint)
    && Array.isArray(blueprint.decisionIds) && blueprint.decisionIds.every((decisionId) => typeof decisionId === "string" && decisionId.trim())
    && Boolean(content && [content.storyPremise, content.openingImage, content.protagonistGoal, content.coreConflict, content.failureCost, content.worldRules, content.readerPromise, content.endingDirection].every((value) => typeof value === "string" && value.trim()))
    && /^[a-f0-9]{64}$/i.test(blueprint.fingerprint)
    && hash(base) === blueprint.fingerprint;
  if (!valid) throw new Error("STORY_BLUEPRINT_INTEGRITY_FAILED");
  return blueprint;
}

export async function readStoryBlueprint(root: string, blueprintId: string, projectSlug?: string): Promise<StoryBlueprint | null> {
  try {
    const blueprint = JSON.parse(await fs.readFile(blueprintPath(root, blueprintId), "utf8")) as StoryBlueprint;
    return assertBlueprintIntegrity(blueprint, projectSlug);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function readLatestStoryBlueprint(root: string, projectSlug: string): Promise<StoryBlueprint | null> {
  const directory = resolveInside(root, "sessions/story-blueprints");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
  const blueprints = (await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readStoryBlueprint(root, name.slice(0, -5), projectSlug)))).filter((blueprint): blueprint is StoryBlueprint => blueprint !== null);
  return blueprints.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.blueprintId.localeCompare(left.blueprintId))[0] || null;
}

export async function generateStoryBlueprint(input: { root: string; projectSlug: string; sourceContractCandidateId: string }): Promise<{ blueprint: StoryBlueprint; created: true }> {
  return withCreativeSessionLock(input.projectSlug, async () => {
    const candidate = await readContractCandidate(input.root, input.sourceContractCandidateId);
    if (!candidate || candidate.projectSlug !== input.projectSlug) throw new Error("STORY_CONTRACT_CANDIDATE_NOT_FOUND");
    if (candidate.status !== "candidate") throw new Error("STORY_CONTRACT_CANDIDATE_STALE");
    const base: Omit<StoryBlueprint, "fingerprint"> = {
      schemaVersion: "story-blueprint.v1",
      blueprintId: createBlueprintId(),
      projectSlug: input.projectSlug,
      sourceContractCandidateId: candidate.candidateId,
      sourceFingerprint: candidate.fingerprint,
      decisionIds: [...new Set(candidate.fields.map((field) => field.sourceDecisionId).filter(Boolean))],
      content: buildContent(candidate),
      createdAt: new Date().toISOString()
    };
    const blueprint = signBlueprint(base);
    await writeJson(blueprintPath(input.root, blueprint.blueprintId), blueprint);
    return { blueprint, created: true };
  });
}

export async function reviseStoryBlueprint(input: { root: string; projectSlug: string; blueprintId: string; expectedFingerprint: string; content: StoryBlueprintContent }): Promise<{ blueprint: StoryBlueprint; created: true }> {
  return withCreativeSessionLock(input.projectSlug, async () => {
    const previous = await readStoryBlueprint(input.root, input.blueprintId, input.projectSlug);
    if (!previous) throw new Error("STORY_BLUEPRINT_NOT_FOUND");
    if (previous.fingerprint !== input.expectedFingerprint) throw new Error("STORY_BLUEPRINT_FINGERPRINT_STALE");
    const base: Omit<StoryBlueprint, "fingerprint"> = {
      schemaVersion: "story-blueprint.v1",
      blueprintId: createBlueprintId(),
      projectSlug: previous.projectSlug,
      sourceContractCandidateId: previous.sourceContractCandidateId,
      sourceFingerprint: previous.sourceFingerprint,
      decisionIds: previous.decisionIds,
      content: input.content,
      revisedFrom: previous.blueprintId,
      createdAt: new Date().toISOString()
    };
    const blueprint = signBlueprint(base);
    assertBlueprintIntegrity(blueprint, input.projectSlug);
    await writeJson(blueprintPath(input.root, blueprint.blueprintId), blueprint);
    return { blueprint, created: true };
  });
}

export async function readStoryBlueprintConfirmation(root: string, blueprintId: string, projectSlug?: string): Promise<StoryBlueprintConfirmation | null> {
  try {
    const confirmation = JSON.parse(await fs.readFile(confirmationPath(root, blueprintId), "utf8")) as StoryBlueprintConfirmation;
    const { fingerprint: _fingerprint, ...base } = confirmation;
    const valid = confirmation.schemaVersion === "story-blueprint-confirmation.v1"
      && (!projectSlug || confirmation.projectSlug === projectSlug)
      && confirmation.blueprintId === blueprintId
      && confirmation.status === "confirmed"
      && Boolean(confirmation.confirmationId?.trim() && confirmation.actorId?.trim())
      && /^[a-f0-9]{64}$/i.test(confirmation.blueprintFingerprint)
      && (confirmation.authorMessageFingerprint === undefined || /^[a-f0-9]{64}$/i.test(confirmation.authorMessageFingerprint))
      && /^[a-f0-9]{64}$/i.test(confirmation.fingerprint)
      && hash(base) === confirmation.fingerprint;
    if (!valid) throw new Error("STORY_BLUEPRINT_CONFIRMATION_INTEGRITY_FAILED");
    return confirmation;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

/** A later author utterance changes the brief and requires a fresh blueprint review. */
export function isStoryBlueprintConfirmationCurrent(session: Pick<CreativeSession, "messages">, confirmation: StoryBlueprintConfirmation): boolean {
  return typeof confirmation.authorMessageFingerprint === "string"
    && confirmation.authorMessageFingerprint === authorMessageFingerprint(session);
}

export async function confirmStoryBlueprint(input: { root: string; projectSlug: string; blueprintId: string; expectedFingerprint: string; actorId: string }): Promise<{ confirmation: StoryBlueprintConfirmation; created: boolean }> {
  if (!input.actorId.trim()) throw new Error("STORY_BLUEPRINT_CONFIRMATION_ACTOR_REQUIRED");
  return withCreativeSessionLock(input.projectSlug, async () => {
    const blueprint = await readStoryBlueprint(input.root, input.blueprintId, input.projectSlug);
    if (!blueprint) throw new Error("STORY_BLUEPRINT_NOT_FOUND");
    if (blueprint.fingerprint !== input.expectedFingerprint) throw new Error("STORY_BLUEPRINT_FINGERPRINT_STALE");

    const session = await readCreativeSession(input.root, input.projectSlug);
    const existing = await readStoryBlueprintConfirmation(input.root, blueprint.blueprintId, input.projectSlug);
    if (existing && isStoryBlueprintConfirmationCurrent(session, existing)) return { confirmation: existing, created: false };

    const base: Omit<StoryBlueprintConfirmation, "fingerprint"> = {
      schemaVersion: "story-blueprint-confirmation.v1",
      confirmationId: `story-blueprint-confirmation-${blueprint.blueprintId}`,
      projectSlug: input.projectSlug,
      blueprintId: blueprint.blueprintId,
      blueprintFingerprint: blueprint.fingerprint,
      actorId: input.actorId,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      authorMessageFingerprint: authorMessageFingerprint(session)
    };
    const confirmation: StoryBlueprintConfirmation = { ...base, fingerprint: hash(base) };
    await writeJson(confirmationPath(input.root, blueprint.blueprintId), confirmation);
    return { confirmation, created: true };
  });
}
