import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export type WorldRuleKnowledgeKind = "objective_canon" | "character_belief" | "institution_belief" | "author_proposal" | "unknown";

export interface WorldRuleContractInput {
  projectSlug: string;
  sourceCandidateId: string;
  sourceFingerprint: string;
  proposition: {
    condition: string;
    mechanism: string;
    result: string;
    cost: string;
    limit: string;
    failure: string;
    prohibitedInferences?: string[];
    exceptions?: string[];
  };
  scope: {
    subjects: string[];
    regions: string[];
    time?: { from?: string; to?: string };
  };
  disclosure: {
    objectiveStatus: "accepted" | "proposed" | "unknown";
    domains: Array<{ domainId: string; kind: WorldRuleKnowledgeKind; claim: string }>;
  };
  evidenceRefs: Array<{ kind: "dialogue-question" | "canon-asset" | "decision-record"; refId: string }>;
}

export interface WorldRuleContract extends WorldRuleContractInput {
  schemaVersion: "world-rule-contract.v1";
  ruleId: string;
  version: number;
  status: "candidate" | "accepted" | "stale";
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

function contractPath(root: string, ruleId: string): string {
  return resolveInside(root, `sessions/world-rule-contracts/${ruleId}.json`);
}

function assertInput(input: WorldRuleContractInput): void {
  if (!input.projectSlug || !input.sourceCandidateId || !/^[a-f0-9]{64}$/i.test(input.sourceFingerprint)) throw new Error("WORLD_RULE_SOURCE_REQUIRED");
  const proposition = input.proposition;
  for (const key of ["condition", "mechanism", "result", "cost", "limit", "failure"] as const) {
    if (!proposition[key]?.trim()) throw new Error(`WORLD_RULE_${key.toUpperCase()}_REQUIRED`);
  }
  if (!input.scope.subjects.length || !input.scope.regions.length) throw new Error("WORLD_RULE_SCOPE_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WORLD_RULE_EVIDENCE_REQUIRED");
  if (!input.disclosure.domains.length) throw new Error("WORLD_RULE_DISCLOSURE_REQUIRED");
  for (const domain of input.disclosure.domains) {
    if (!domain.domainId || !domain.claim.trim()) throw new Error("WORLD_RULE_DISCLOSURE_INVALID");
  }
  if (input.disclosure.objectiveStatus === "accepted" && !input.disclosure.domains.some((domain) => domain.kind === "objective_canon")) {
    throw new Error("WORLD_RULE_OBJECTIVE_EVIDENCE_REQUIRED");
  }
}

function baseContract(input: WorldRuleContractInput): Omit<WorldRuleContract, "fingerprint"> {
  const normalized = {
    ...input,
    proposition: {
      ...input.proposition,
      prohibitedInferences: [...(input.proposition.prohibitedInferences || [])],
      exceptions: [...(input.proposition.exceptions || [])]
    },
    scope: {
      subjects: [...new Set(input.scope.subjects)],
      regions: [...new Set(input.scope.regions)],
      ...(input.scope.time ? { time: input.scope.time } : {})
    },
    disclosure: {
      objectiveStatus: input.disclosure.objectiveStatus,
      domains: input.disclosure.domains.map((domain) => ({ ...domain }))
    },
    evidenceRefs: input.evidenceRefs.map((ref) => ({ ...ref }))
  };
  const stableRuleId = `world-rule-${input.projectSlug}-${crypto.createHash("sha256").update(`${input.sourceCandidateId}:${input.sourceFingerprint}`).digest("hex").slice(0, 24)}`;
  return {
    ...normalized,
    schemaVersion: "world-rule-contract.v1",
    ruleId: stableRuleId,
    version: 1,
    status: "candidate",
    canonWritten: false,
    createdAt: new Date().toISOString()
  };
}

export async function createWorldRuleContract(
  root: string,
  input: WorldRuleContractInput,
  options: { persist?: boolean } = {}
): Promise<{ contract: WorldRuleContract; created: boolean }> {
  assertInput(input);
  const base = baseContract(input);
  const contract: WorldRuleContract = {
    ...base,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex")
  };
  if (options.persist !== false) {
    const target = contractPath(root, contract.ruleId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
  }
  return { contract, created: true };
}

export async function readWorldRuleContract(root: string, ruleId: string): Promise<WorldRuleContract | null> {
  try {
    const contract = JSON.parse(await fs.readFile(contractPath(root, ruleId), "utf8")) as WorldRuleContract;
    return assertWorldRuleContractIntegrity(contract, ruleId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export function assertWorldRuleContractIntegrity(contract: WorldRuleContract, expectedId?: string): WorldRuleContract {
  const { fingerprint: _fingerprint, ...base } = contract;
  const proposition = contract.proposition;
  const scope = contract.scope;
  const disclosure = contract.disclosure;
  const valid = contract.schemaVersion === "world-rule-contract.v1" && (!expectedId || contract.ruleId === expectedId) && Boolean(contract.ruleId?.trim() && contract.projectSlug?.trim() && contract.sourceCandidateId?.trim()) && /^[a-f0-9]{64}$/i.test(contract.sourceFingerprint) && Number.isInteger(contract.version) && contract.version > 0 && ["candidate", "accepted", "stale"].includes(contract.status) && contract.canonWritten === false && [proposition?.condition, proposition?.mechanism, proposition?.result, proposition?.cost, proposition?.limit, proposition?.failure].every((value) => typeof value === "string" && value.trim()) && Array.isArray(scope?.subjects) && scope.subjects.length > 0 && scope.subjects.every((value) => typeof value === "string" && value.trim()) && Array.isArray(scope?.regions) && scope.regions.length > 0 && scope.regions.every((value) => typeof value === "string" && value.trim()) && ["accepted", "proposed", "unknown"].includes(disclosure?.objectiveStatus) && Array.isArray(disclosure?.domains) && disclosure.domains.length > 0 && disclosure.domains.every((domain) => Boolean(domain?.domainId?.trim() && domain.claim?.trim()) && ["objective_canon", "character_belief", "institution_belief", "author_proposal", "other_view", "plan", "inference", "unknown"].includes(domain.kind)) && Array.isArray(contract.evidenceRefs) && contract.evidenceRefs.length > 0 && contract.evidenceRefs.every((ref) => ["dialogue-question", "canon-asset", "decision-record"].includes(ref.kind) && ref.refId?.trim()) && hash(base) === contract.fingerprint;
  if (!valid) throw new Error("WORLD_RULE_CONTRACT_INTEGRITY_FAILED");
  return contract;
}

export async function listWorldRuleContracts(root: string): Promise<WorldRuleContract[]> {
  const directory = resolveInside(root, "sessions/world-rule-contracts");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const contracts: WorldRuleContract[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const contract = await readWorldRuleContract(root, name.slice(0, -5));
    if (contract) contracts.push(contract);
  }
  return contracts.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function evaluateWorldRuleApplicability(
  contract: WorldRuleContract,
  input: { region: string; chapter: string }
): "applicable" | "not_applicable" | "unknown" {
  if (!contract.scope.regions.includes(input.region)) return "unknown";
  const time = contract.scope.time;
  if (time?.from && input.chapter < time.from) return "not_applicable";
  if (time?.to && input.chapter > time.to) return "not_applicable";
  return "applicable";
}
