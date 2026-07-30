import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readCharacterDramaticContract } from "./characterContract.js";
import { readCharacterChoiceEvidence } from "./characterChoice.js";

export interface CharacterArcMilestone { milestoneId: string; choiceEvidenceId: string; milestone: string; actualChange: string; sourceRefs: string[]; recordedAt: string; }
export interface CharacterArcContract {
  schemaVersion: "character-arc-contract.v1";
  arcId: string;
  projectSlug: string;
  characterId: string;
  dramaticContractId: string;
  startState: string;
  targetChange: string;
  keyPressures: string[];
  plannedChoices: string[];
  plannedCosts: string[];
  relationshipImpacts: string[];
  allowedRegression: string;
  sourceRefs: string[];
  lifecycle: "planned" | "active" | "closed";
  milestones: CharacterArcMilestone[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function arcPath(root: string, arcId: string): string { return resolveInside(root, `sessions/character-arcs/${arcId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function readCharacterArcContract(root: string, arcId: string): Promise<CharacterArcContract | null> { return readJson<CharacterArcContract>(arcPath(root, arcId)); }
export async function listCharacterArcContracts(root: string, projectSlug: string, characterId?: string): Promise<CharacterArcContract[]> {
  const directory = resolveInside(root, "sessions/character-arcs"); let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CharacterArcContract>(path.join(directory, name))));
  return records.filter((record): record is CharacterArcContract => Boolean(record && record.projectSlug === projectSlug && (!characterId || record.characterId === characterId))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function createCharacterArcContract(input: { root: string; projectSlug: string; characterId: string; dramaticContractId: string; startState: string; targetChange: string; keyPressures: readonly string[]; plannedChoices: readonly string[]; plannedCosts: readonly string[]; relationshipImpacts: readonly string[]; allowedRegression: string; sourceRefs: readonly string[] }): Promise<CharacterArcContract> {
  const dramatic = await readCharacterDramaticContract(input.root, input.dramaticContractId);
  if (!dramatic || dramatic.projectSlug !== input.projectSlug || dramatic.characterId !== input.characterId) throw new Error("CHARACTER_CONTRACT_NOT_FOUND");
  if (!input.sourceRefs.length) throw new Error("CHARACTER_ARC_SOURCE_REQUIRED");
  const required = [input.startState, input.targetChange, input.allowedRegression];
  if (required.some((value) => !value.trim()) || !input.keyPressures.length || !input.plannedChoices.length || !input.plannedCosts.length) throw new Error("CHARACTER_ARC_FIELDS_REQUIRED");
  const arcId = `character-arc-${input.projectSlug}-${input.characterId}-${hash({ dramatic: input.dramaticContractId, target: input.targetChange }).slice(0, 16)}`;
  const existing = await readCharacterArcContract(input.root, arcId); if (existing) return existing;
  const base = { schemaVersion: "character-arc-contract.v1" as const, arcId, projectSlug: input.projectSlug, characterId: input.characterId, dramaticContractId: input.dramaticContractId, startState: input.startState, targetChange: input.targetChange, keyPressures: [...input.keyPressures], plannedChoices: [...input.plannedChoices], plannedCosts: [...input.plannedCosts], relationshipImpacts: [...input.relationshipImpacts], allowedRegression: input.allowedRegression, sourceRefs: [...input.sourceRefs], lifecycle: "planned" as const, milestones: [] as CharacterArcMilestone[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const arc: CharacterArcContract = { ...base, fingerprint: hash(base) }; await writeJson(arcPath(input.root, arcId), arc); return arc;
}
export async function recordCharacterArcMilestone(input: { root: string; arcId: string; choiceEvidenceId: string; milestone: string; actualChange: string; sourceRefs: readonly string[] }): Promise<CharacterArcContract> {
  const arc = await readCharacterArcContract(input.root, input.arcId); if (!arc) throw new Error("CHARACTER_ARC_NOT_FOUND");
  const evidence = await readCharacterChoiceEvidence(input.root, input.choiceEvidenceId); if (!evidence) throw new Error("CHARACTER_CHOICE_EVIDENCE_NOT_FOUND");
  if (evidence.projectSlug !== arc.projectSlug || evidence.characterId !== arc.characterId || evidence.status !== "observed") throw new Error("CHARACTER_CHOICE_EVIDENCE_NOT_OBSERVED");
  if (!input.milestone.trim() || !input.actualChange.trim() || !input.sourceRefs.length) throw new Error("CHARACTER_ARC_MILESTONE_REQUIRED");
  const existing = arc.milestones.find((item) => item.choiceEvidenceId === input.choiceEvidenceId); if (existing) return arc;
  const milestoneBase = { milestoneId: `arc-milestone-${hash({ arc: arc.arcId, evidence: input.choiceEvidenceId }).slice(0, 16)}`, choiceEvidenceId: input.choiceEvidenceId, milestone: input.milestone, actualChange: input.actualChange, sourceRefs: [...input.sourceRefs], recordedAt: new Date().toISOString() };
  const base = { ...arc, lifecycle: "active" as const, milestones: [...arc.milestones, milestoneBase], updatedAt: new Date().toISOString() };
  const updated: CharacterArcContract = { ...base, fingerprint: hash(base) }; await writeJson(arcPath(input.root, arc.arcId), updated); return updated;
}
