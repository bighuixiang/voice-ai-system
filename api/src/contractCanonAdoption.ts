import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractAdoptionProposal, type ContractAdoptionProposal } from "./contractAdoption.js";
import { readWorldRuleContract, type WorldRuleContract } from "./worldRuleContract.js";

type MutationStatus = "prepared" | "committing" | "committed" | "rolling_back" | "rolled_back" | "failed";

export interface ContractMutationPlan {
  schemaVersion: "mutation-plan.v1";
  mutationId: string;
  proposalId: string;
  projectSlug: string;
  authorizationId: string;
  actorId: string;
  fencingToken: string;
  status: MutationStatus;
  targets: Array<{ relativePath: string; beforeSha256?: string; afterSha256: string; existed: boolean }>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ContractCanonAdoptionResult {
  status: "committed" | "rolled_back" | "blocked";
  canonWritten: boolean;
  mutationId: string;
  reason?: "AUTHOR_AUTHORIZATION_REQUIRED" | "PROPOSAL_NOT_FOUND" | "PROPOSAL_NOT_READY" | "PROPOSAL_FINGERPRINT_STALE" | "MUTATION_LEASE_UNAVAILABLE" | "WORLD_RULE_CONTRACT_NOT_FOUND" | "WORLD_RULE_CONTRACT_STALE" | "FENCING_TOKEN_LOST";
}

interface AdoptionInput {
  expectedProposalFingerprint: string;
  authorization?: { actorId: string; authorizationId: string };
  faultAt?: "after-first-write";
  fenceAt?: "after-first-write";
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function mutationPath(root: string, mutationId: string): string {
  return resolveInside(root, `sessions/mutations/${mutationId}.json`);
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function writePlan(root: string, plan: ContractMutationPlan): Promise<void> {
  await writeJson(mutationPath(root, plan.mutationId), plan);
}

async function acquireMutationLease(root: string, mutationId: string, fencingToken: string): Promise<fs.FileHandle | null> {
  const leasePath = resolveInside(root, "sessions/mutations/contract-adoption.lock");
  await fs.mkdir(path.dirname(leasePath), { recursive: true });
  try {
    const handle = await fs.open(leasePath, "wx");
    await handle.writeFile(JSON.stringify({ mutationId, fencingToken, acquiredAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
    await handle.sync();
    return handle;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST") {
      try {
        const current = JSON.parse(await fs.readFile(leasePath, "utf8")) as { acquiredAt?: string; heartbeatAt?: string };
        const leaseTimestamp = current.heartbeatAt || current.acquiredAt;
        const acquiredAt = leaseTimestamp ? Date.parse(leaseTimestamp) : Number.NaN;
        if (Number.isFinite(acquiredAt) && Date.now() - acquiredAt > 60_000) {
          await fs.rm(leasePath, { force: true });
          const retry = await fs.open(leasePath, "wx");
          await retry.writeFile(JSON.stringify({ mutationId, fencingToken, acquiredAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
          await retry.sync();
          return retry;
        }
      } catch {
        // Keep the lease conservative when its owner cannot be read.
      }
      return null;
    }
    throw error;
  }
}

async function releaseMutationLease(root: string, handle: fs.FileHandle, fencingToken: string): Promise<void> {
  const leasePath = resolveInside(root, "sessions/mutations/contract-adoption.lock");
  await handle.close();
  try {
    const current = JSON.parse(await fs.readFile(leasePath, "utf8")) as { fencingToken?: string };
    if (current.fencingToken === fencingToken) await fs.rm(leasePath, { force: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
}

function startMutationLeaseHeartbeat(root: string, mutationId: string, fencingToken: string): () => Promise<void> {
  const leasePath = resolveInside(root, "sessions/mutations/contract-adoption.lock");
  let stopped = false;
  const heartbeat = async () => {
    if (stopped) return;
    try {
      const current = JSON.parse(await fs.readFile(leasePath, "utf8")) as { mutationId?: string; fencingToken?: string; acquiredAt?: string };
      if (current.fencingToken !== fencingToken || current.mutationId !== mutationId) return;
      await writeJson(leasePath, { ...current, heartbeatAt: new Date().toISOString() });
    } catch {
      // Replacement or disappearance is handled by assertMutationLease.
    }
  };
  let pending: Promise<void> | null = null;
  const timer = setInterval(() => {
    pending = heartbeat().finally(() => { pending = null; });
  }, 10_000);
  return async () => { stopped = true; clearInterval(timer); if (pending) await pending; };
}

async function assertMutationLease(root: string, fencingToken: string): Promise<void> {
  const leasePath = resolveInside(root, "sessions/mutations/contract-adoption.lock");
  const current = JSON.parse(await fs.readFile(leasePath, "utf8")) as { fencingToken?: string };
  if (current.fencingToken !== fencingToken) throw new Error("FENCING_TOKEN_LOST");
}

export async function readMutationPlan(root: string, mutationId: string): Promise<ContractMutationPlan | null> {
  try {
    return JSON.parse(await fs.readFile(mutationPath(root, mutationId), "utf8")) as ContractMutationPlan;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function recoverContractMutations(root: string): Promise<ContractMutationPlan[]> {
  const directory = resolveInside(root, "sessions/mutations");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const recovered: ContractMutationPlan[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const mutationId = name.slice(0, -5);
    const plan = await readMutationPlan(root, mutationId);
    if (!plan || !["prepared", "committing", "rolling_back", "failed"].includes(plan.status)) continue;
    for (const target of plan.targets) {
      const targetPath = resolveInside(root, target.relativePath);
      const backupPath = resolveInside(root, `sessions/staging/${mutationId}/before/${target.relativePath}`);
      if (target.existed) {
        try {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.copyFile(backupPath, targetPath);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
        }
      } else {
        await fs.rm(targetPath, { force: true });
      }
    }
    const rolledBack: ContractMutationPlan = { ...plan, status: "rolled_back", error: "RECOVERED_AFTER_RESTART", updatedAt: new Date().toISOString() };
    await writePlan(root, rolledBack);
    await fs.rm(resolveInside(root, `sessions/staging/${mutationId}`), { recursive: true, force: true });
    recovered.push(rolledBack);
  }
  return recovered;
}

export async function recoverContractMutationsAtStartup(novelsRoot: string): Promise<ContractMutationPlan[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await fs.readdir(novelsRoot, { withFileTypes: true })).map((entry) => ({ name: entry.name, isDirectory: () => entry.isDirectory() }));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const recovered: ContractMutationPlan[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    recovered.push(...await recoverContractMutations(path.join(novelsRoot, entry.name)));
  }
  return recovered;
}

async function readOptional(root: string, relativePath: string): Promise<{ existed: boolean; content: string }> {
  try {
    return { existed: true, content: await fs.readFile(resolveInside(root, relativePath), "utf8") };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return { existed: false, content: "" };
    throw error;
  }
}

function buildStoryControl(content: string, desire?: string): string {
  if (!desire) return content;
  const control = JSON.parse(content) as { characters?: Array<Record<string, unknown>>; [key: string]: unknown };
  const characters = Array.isArray(control.characters) ? control.characters : [];
  const index = characters.findIndex((character) => character.id === "char-protagonist");
  if (index >= 0) characters[index] = { ...characters[index], desire, goal: desire, status: "active", updatedAt: new Date().toISOString() };
  else characters.push({ id: "char-protagonist", name: "Protagonist", desire, goal: desire, status: "active", updatedAt: new Date().toISOString() });
  control.characters = characters;
  control.updatedAt = new Date().toISOString();
  return `${JSON.stringify(control, null, 2)}\n`;
}

function buildBible(content: string, desire: string | undefined, proposal: ContractAdoptionProposal): string {
  if (!desire) return content;
  const section = `\n## Author-confirmed story contract\n\n- Protagonist primary desire: ${desire}\n- Source candidate: ${proposal.candidateId}\n- Adoption proposal: ${proposal.proposalId}\n`;
  return content.includes(`- Source candidate: ${proposal.candidateId}`) ? content : `${content.trimEnd()}\n${section}`;
}

function buildWorldBible(content: string, proposal: ContractAdoptionProposal, worldRule?: WorldRuleContract | null): string {
  const rule = proposal.acceptedFields.find((field) => field.path === "world.rules.primary")?.value;
  if (!rule || content.includes(`- Source candidate: ${proposal.candidateId}`)) return content;
  const structured = worldRule ? `\n- Condition: ${worldRule.proposition.condition}\n- Mechanism: ${worldRule.proposition.mechanism}\n- Result: ${worldRule.proposition.result}\n- Cost: ${worldRule.proposition.cost}\n- Limit: ${worldRule.proposition.limit}\n- Failure: ${worldRule.proposition.failure}\n- Regions: ${worldRule.scope.regions.join(", ")}\n` : "";
  return `${content.trimEnd()}\n\n## Author-confirmed world rule\n\n- Primary rule: ${rule}${structured}- Source candidate: ${proposal.candidateId}\n- Adoption proposal: ${proposal.proposalId}\n`;
}

function buildContractProjection(proposal: ContractAdoptionProposal) {
  const value = (fieldPath: string): string | null => proposal.acceptedFields.find((field) => field.path === fieldPath)?.value || null;
  return {
    protagonist: { primaryDesire: value("protagonist.primaryDesire"), innerNeed: value("protagonist.innerNeed"), misbelief: value("protagonist.misbelief") },
    conflict: { core: value("conflict.core"), opposingPressure: value("conflict.opposingPressure") },
    stakes: { failureCost: value("stakes.failureCost"), irreversibleChoice: value("stakes.irreversibleChoice") },
    world: { primaryRule: value("world.rules.primary") },
    readerPromise: value("readerPromise"),
    endingDirection: value("endingDirection")
  };
}

function buildProject(content: string, proposal: ContractAdoptionProposal): string {
  const project = JSON.parse(content) as Record<string, unknown>;
  project.storyContract = {
    contractId: `story-contract-${proposal.candidateId}`,
    status: "active",
    fingerprint: proposal.candidateFingerprint,
    fieldPaths: proposal.acceptedFields.map((field) => field.path),
    contract: buildContractProjection(proposal),
    ...(proposal.worldRuleContractId ? { worldRuleContractId: proposal.worldRuleContractId } : {}),
    adoptionProposalId: proposal.proposalId,
    adoptedAt: new Date().toISOString()
  };
  project.updatedAt = new Date().toISOString();
  return `${JSON.stringify(project, null, 2)}\n`;
}

export async function commitContractAdoption(root: string, input: AdoptionInput): Promise<ContractCanonAdoptionResult> {
  const proposal = await readContractAdoptionProposal(root);
  const fallbackMutationId = `mutation-contract-adoption-${proposal?.proposalId || "unknown"}-${input.authorization?.authorizationId || "unauthorized"}`;
  if (!input.authorization) return { status: "blocked", canonWritten: false, mutationId: fallbackMutationId, reason: "AUTHOR_AUTHORIZATION_REQUIRED" };
  if (!proposal) return { status: "blocked", canonWritten: false, mutationId: fallbackMutationId, reason: "PROPOSAL_NOT_FOUND" };
  const mutationId = `mutation-contract-adoption-${proposal.proposalId}-${input.authorization.authorizationId}`;
  const existing = await readMutationPlan(root, mutationId);
  if (existing?.status === "committed") return { status: "committed", canonWritten: true, mutationId };
  if (proposal.status !== "ready_for_authorization") return { status: "blocked", canonWritten: false, mutationId, reason: "PROPOSAL_NOT_READY" };
  if (proposal.fingerprint !== input.expectedProposalFingerprint) return { status: "blocked", canonWritten: false, mutationId, reason: "PROPOSAL_FINGERPRINT_STALE" };
  const worldRule = proposal.worldRuleContractId ? await readWorldRuleContract(root, proposal.worldRuleContractId) : null;
  if (proposal.worldRuleContractId && !worldRule) return { status: "blocked", canonWritten: false, mutationId, reason: "WORLD_RULE_CONTRACT_NOT_FOUND" };
  if (worldRule && (worldRule.sourceCandidateId !== proposal.candidateId || worldRule.sourceFingerprint !== proposal.candidateFingerprint)) {
    return { status: "blocked", canonWritten: false, mutationId, reason: "WORLD_RULE_CONTRACT_STALE" };
  }

  const fencingToken = crypto.randomUUID();
  const lease = await acquireMutationLease(root, mutationId, fencingToken);
  if (!lease) return { status: "blocked", canonWritten: false, mutationId, reason: "MUTATION_LEASE_UNAVAILABLE" };
  const stopLeaseHeartbeat = startMutationLeaseHeartbeat(root, mutationId, fencingToken);

  const desire = proposal.acceptedFields.find((field) => field.path === "protagonist.primaryDesire")?.value;
  if (proposal.acceptedFields.length === 0) {
    await stopLeaseHeartbeat();
    await releaseMutationLease(root, lease, fencingToken);
    return { status: "blocked", canonWritten: false, mutationId, reason: "PROPOSAL_NOT_READY" };
  }
  const targets = ["project.json", "story-control/story-control.json", "bible/characters.md", "bible/world.md", "sessions/story-contract-adoption-proposal.json", "sessions/canon-commit-events.jsonl", "sessions/projection-invalidation-events.jsonl"];
  const before = new Map<string, { existed: boolean; content: string }>();
  for (const target of targets) before.set(target, await readOptional(root, target));
  const event = JSON.stringify({ schemaVersion: "canon-commit-event.v1", eventId: `canon-commit-${mutationId}`, mutationId, proposalId: proposal.proposalId, authorizationId: input.authorization.authorizationId, actorId: input.authorization.actorId, candidateId: proposal.candidateId, createdAt: new Date().toISOString() }) + "\n";
  const invalidation = JSON.stringify({ schemaVersion: "projection-invalidation-event.v1", eventId: `projection-invalidation-${mutationId}`, mutationId, candidateId: proposal.candidateId, reviewId: proposal.reviewId, affectedProjections: ["understanding-review", "contract-candidate", "story-graph", "knowledge-index"], createdAt: new Date().toISOString() }) + "\n";
  const committedProposal = `${JSON.stringify({ ...proposal, status: "committed", canonWritten: true, committedMutationId: mutationId, committedAt: new Date().toISOString() }, null, 2)}\n`;
  const after = new Map<string, string>([
    ["project.json", buildProject(before.get("project.json")!.content, proposal)],
    ["story-control/story-control.json", buildStoryControl(before.get("story-control/story-control.json")!.content, desire)],
    ["bible/characters.md", buildBible(before.get("bible/characters.md")!.content, desire, proposal)],
    ["bible/world.md", buildWorldBible(before.get("bible/world.md")!.content, proposal, worldRule)],
    ["sessions/story-contract-adoption-proposal.json", committedProposal],
    ["sessions/canon-commit-events.jsonl", `${before.get("sessions/canon-commit-events.jsonl")!.content}${event}`],
    ["sessions/projection-invalidation-events.jsonl", `${before.get("sessions/projection-invalidation-events.jsonl")!.content}${invalidation}`]
  ]);
  const planBase = {
    schemaVersion: "mutation-plan.v1" as const,
    mutationId,
    proposalId: proposal.proposalId,
    projectSlug: proposal.projectSlug,
    authorizationId: input.authorization.authorizationId,
    actorId: input.authorization.actorId,
    fencingToken,
    status: "prepared" as MutationStatus,
    targets: targets.map((relativePath) => ({ relativePath, ...(before.get(relativePath)!.existed ? { beforeSha256: sha256(before.get(relativePath)!.content) } : {}), afterSha256: sha256(after.get(relativePath)!), existed: before.get(relativePath)!.existed })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await writePlan(root, planBase);
  const stagingRoot = resolveInside(root, `sessions/staging/${mutationId}`);
  try {
    for (const relativePath of targets) {
      const original = before.get(relativePath)!;
      if (!original.existed) continue;
      const backup = path.join(stagingRoot, "before", relativePath);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, original.content, "utf8");
    }
    for (const relativePath of targets) {
      const staged = path.join(stagingRoot, relativePath);
      await fs.mkdir(path.dirname(staged), { recursive: true });
      await fs.writeFile(staged, after.get(relativePath)!, "utf8");
    }
    await writePlan(root, { ...planBase, status: "committing", updatedAt: new Date().toISOString() });
    let writeCount = 0;
    for (const relativePath of targets) {
      await assertMutationLease(root, fencingToken);
      const target = resolveInside(root, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(path.join(stagingRoot, relativePath), target);
      writeCount += 1;
      if (input.fenceAt === "after-first-write" && writeCount === 1) {
        const leasePath = resolveInside(root, "sessions/mutations/contract-adoption.lock");
        await fs.rm(leasePath, { force: true });
        await fs.writeFile(leasePath, JSON.stringify({ mutationId: "replacement", fencingToken: "replacement-token", acquiredAt: new Date().toISOString() }), "utf8");
      }
      if (input.faultAt === "after-first-write" && writeCount === 1) throw new Error("INJECTED_MUTATION_FAULT");
    }
    await assertMutationLease(root, fencingToken);
    await writePlan(root, { ...planBase, status: "committed", updatedAt: new Date().toISOString() });
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await stopLeaseHeartbeat();
    await releaseMutationLease(root, lease, fencingToken);
    return { status: "committed", canonWritten: true, mutationId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === "FENCING_TOKEN_LOST") {
      // Once ownership is lost, the old writer must not perform any further
      // target writes. Leave the plan failed for the replacement owner/startup
      // recovery to reconcile from its durable before-images.
      await writePlan(root, { ...planBase, status: "failed", error: errorMessage, updatedAt: new Date().toISOString() });
      await stopLeaseHeartbeat();
      await releaseMutationLease(root, lease, fencingToken);
      return { status: "blocked", canonWritten: false, mutationId, reason: "FENCING_TOKEN_LOST" };
    }
    await writePlan(root, { ...planBase, status: "rolling_back", error: errorMessage, updatedAt: new Date().toISOString() });
    for (const relativePath of targets) {
      const target = resolveInside(root, relativePath);
      const original = before.get(relativePath)!;
      if (original.existed) await fs.writeFile(target, original.content, "utf8");
      else await fs.rm(target, { force: true });
    }
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await writePlan(root, { ...planBase, status: "rolled_back", error: errorMessage, updatedAt: new Date().toISOString() });
    await stopLeaseHeartbeat();
    await releaseMutationLease(root, lease, fencingToken);
    return { status: "rolled_back", canonWritten: false, mutationId };
  }
}
