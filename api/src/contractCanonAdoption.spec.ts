import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitContractAdoption, readMutationPlan, recoverContractMutations } from "./contractCanonAdoption.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function setup(root: string) {
  await fs.mkdir(path.join(root, "story-control"), { recursive: true });
  await fs.mkdir(path.join(root, "bible"), { recursive: true });
  await fs.mkdir(path.join(root, "sessions"), { recursive: true });
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "demo", title: "Demo", storyContract: undefined }), "utf8");
  await fs.writeFile(path.join(root, "story-control", "story-control.json"), JSON.stringify({ version: 1, premise: "", currentArcId: "arc-main-01", arcs: [], characters: [{ id: "char-protagonist", name: "Protagonist", desire: "old desire", goal: "", currentState: "", knownSecrets: "", relationshipNotes: "", powerLevel: "", signatureTraits: [], coreWound: "", misbelief: "", redemptionArc: "", sublimationGoal: "", smallPersonHighlight: "", relationshipPressure: "", growthStage: "seed", status: "seed", updatedAt: "old" }], events: [], orchestrationNotes: "", updatedAt: "old" }), "utf8");
  await fs.writeFile(path.join(root, "bible", "characters.md"), "# Characters\n\nOriginal canon.\n", "utf8");
  await fs.writeFile(path.join(root, "bible", "world.md"), "# World\n\nOriginal rules.\n", "utf8");
  const proposal = { schemaVersion: "story-contract-adoption-proposal.v1", proposalId: "contract-adoption-contract-candidate-decision-1", candidateId: "contract-candidate-decision-1", candidateFingerprint: "c".repeat(64), projectSlug: "demo", status: "ready_for_authorization", fieldDecisions: [{ fieldId: "field-1", status: "accept", reason: "confirmed" }], acceptedFields: [{ fieldId: "field-1", path: "protagonist.primaryDesire", value: "Expose the truth.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-primary-desire" }], sourceDecisionId: "decision-1", lock: "unlocked" }], unresolvedFieldIds: [], reviewId: "review-1", canonWritten: false, createdAt: new Date().toISOString(), fingerprint: "p".repeat(64) };
  await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify(proposal), "utf8");
  return proposal;
}

describe("contract canon adoption transaction", () => {
  it("atomically commits an explicitly authorized proposal", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const result = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "auth-1" } });
    expect(result).toMatchObject({ status: "committed", canonWritten: true, mutationId: expect.any(String) });
    expect(JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8"))).toMatchObject({ storyContract: { status: "active", fingerprint: proposal.candidateFingerprint } });
    expect(await fs.readFile(path.join(root, "bible", "characters.md"), "utf8")).toContain("Expose the truth.");
    expect(JSON.parse(await fs.readFile(path.join(root, "story-control", "story-control.json"), "utf8"))).toMatchObject({ characters: [expect.objectContaining({ desire: "Expose the truth." })] });
    expect(await fs.readFile(path.join(root, "sessions", "canon-commit-events.jsonl"), "utf8")).toContain("auth-1");
    expect(await fs.readFile(path.join(root, "sessions", "projection-invalidation-events.jsonl"), "utf8")).toContain("story-graph");
    expect(await readMutationPlan(root, result.mutationId)).toMatchObject({ status: "committed", authorizationId: "auth-1" });
    expect(JSON.parse(await fs.readFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), "utf8"))).toMatchObject({ status: "committed", canonWritten: true });
  });

  it("fails closed without authorization and rolls back after an injected write fault", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const beforeProject = await fs.readFile(path.join(root, "project.json"), "utf8");
    await expect(commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint })).resolves.toMatchObject({ status: "blocked", reason: "AUTHOR_AUTHORIZATION_REQUIRED" });
    await expect(commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "auth-fault" }, faultAt: "after-first-write" })).resolves.toMatchObject({ status: "rolled_back" });
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(beforeProject);
    expect(await fs.readFile(path.join(root, "bible", "characters.md"), "utf8")).toBe("# Characters\n\nOriginal canon.\n");
  });

  it("recovers a committing plan after a simulated process restart", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    await setup(root);
    const mutationId = "mutation-crashed-1";
    const staging = path.join(root, "sessions", "staging", mutationId, "before");
    await fs.mkdir(staging, { recursive: true });
    const original = "# Characters\n\nOriginal canon.\n";
    await fs.mkdir(path.join(staging, "bible"), { recursive: true });
    await fs.writeFile(path.join(staging, "bible", "characters.md"), original, "utf8");
    await fs.writeFile(path.join(root, "bible", "characters.md"), "# Characters\n\nPARTIAL WRITE\n", "utf8");
    await fs.writeFile(path.join(root, "sessions", "mutations-crash.tmp"), "", "utf8");
    await fs.mkdir(path.join(root, "sessions", "mutations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "mutations", `${mutationId}.json`), JSON.stringify({ schemaVersion: "mutation-plan.v1", mutationId, proposalId: "p", projectSlug: "demo", authorizationId: "a", actorId: "u", status: "committing", targets: [{ relativePath: "bible/characters.md", beforeSha256: "", afterSha256: "", existed: true }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), "utf8");
    const recovered = await recoverContractMutations(root);
    expect(recovered).toMatchObject([{ mutationId, status: "rolled_back", error: "RECOVERED_AFTER_RESTART" }]);
    expect(await fs.readFile(path.join(root, "bible", "characters.md"), "utf8")).toBe(original);
  });

  it("fences concurrent and repeated adoption attempts to one canon commit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const [first, second] = await Promise.all([
      commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-1", authorizationId: "auth-concurrent-1" } }),
      commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-2", authorizationId: "auth-concurrent-2" } })
    ]);
    expect([first.status, second.status].filter((status) => status === "committed")).toHaveLength(1);
    expect([first.status, second.status].filter((status) => status === "blocked")).toHaveLength(1);
    const repeated = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-3", authorizationId: "auth-concurrent-3" } });
    expect(repeated).toMatchObject({ status: "blocked", reason: "PROPOSAL_NOT_READY", canonWritten: false });
  });

  it("reclaims an expired lease after a crashed writer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    await fs.mkdir(path.join(root, "sessions", "mutations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "mutations", "contract-adoption.lock"), JSON.stringify({ mutationId: "crashed", fencingToken: "old", acquiredAt: new Date(Date.now() - 120_000).toISOString() }), "utf8");
    const result = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-recovery", authorizationId: "auth-recovery" } });
    expect(result.status).toBe("committed");
  });

  it("commits only accepted fields when the proposal intentionally leaves the rest unknown", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const conflictField = { fieldId: "field-conflict", path: "conflict.core", value: "A costly symbiosis", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-conflict" }], sourceDecisionId: "decision-1", lock: "unlocked" };
    const partialProposal = { ...proposal, acceptedFields: [conflictField], unresolvedFieldIds: ["field-1"] };
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify(partialProposal), "utf8");
    const beforeCharacters = await fs.readFile(path.join(root, "bible", "characters.md"), "utf8");
    const result = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-partial", authorizationId: "auth-partial" } });
    expect(result.status).toBe("committed");
    expect(JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8"))).toMatchObject({ storyContract: { fieldPaths: ["conflict.core"] } });
    expect(await fs.readFile(path.join(root, "bible", "characters.md"), "utf8")).toBe(beforeCharacters);
    expect(JSON.parse(await fs.readFile(path.join(root, "story-control", "story-control.json"), "utf8"))).toMatchObject({ characters: [expect.objectContaining({ desire: "old desire" })] });
  });

  it("projects accepted StoryContract fields and the structured world rule without projecting rejected fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const worldRule = {
      schemaVersion: "world-rule-contract.v1",
      ruleId: "world-rule-1",
      version: 1,
      projectSlug: "demo",
      sourceCandidateId: proposal.candidateId,
      sourceFingerprint: proposal.candidateFingerprint,
      status: "candidate",
      proposition: { condition: "A charged anchor exists.", mechanism: "The anchor folds a path.", result: "The caster crosses.", cost: "One day of lifespan.", limit: "Once per day.", failure: "The attempt causes pain." },
      scope: { subjects: ["caster"], regions: ["nine-lotus-mountain"] },
      disclosure: { objectiveStatus: "unknown", domains: [{ domainId: "church", kind: "institution_belief", claim: "The church says it is divine." }] },
      evidenceRefs: [{ kind: "dialogue-question", refId: "question-world-rule" }],
      canonWritten: false,
      createdAt: new Date().toISOString(),
      fingerprint: ""
    };
    const { fingerprint: _fingerprint, ...worldRuleBase } = worldRule;
    worldRule.fingerprint = crypto.createHash("sha256").update(JSON.stringify(worldRuleBase)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "world-rule-contracts"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "world-rule-contracts", "world-rule-1.json"), JSON.stringify(worldRule), "utf8");
    const expanded = {
      ...proposal,
      worldRuleContractId: "world-rule-1",
      acceptedFields: [
        ...proposal.acceptedFields,
        { fieldId: "field-world", path: "world.rules.primary", value: "Charged anchors fold paths.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-world-rule" }], sourceDecisionId: "decision-1", lock: "unlocked" },
        { fieldId: "field-conflict", path: "conflict.core", value: "The order erases evidence.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-core-conflict" }], sourceDecisionId: "decision-1", lock: "unlocked" },
        { fieldId: "field-failure", path: "stakes.failureCost", value: "The last ally is lost.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-failure-cost" }], sourceDecisionId: "decision-1", lock: "unlocked" },
        { fieldId: "field-ending", path: "endingDirection", value: "Truth at irreversible cost.", epistemicStatus: "explicit", evidenceRefs: [{ kind: "dialogue-question", refId: "question-ending-direction" }], sourceDecisionId: "decision-1", lock: "unlocked" }
      ],
      fieldDecisions: [
        ...proposal.fieldDecisions,
        { fieldId: "field-world", status: "accept" },
        { fieldId: "field-conflict", status: "accept" },
        { fieldId: "field-failure", status: "accept" },
        { fieldId: "field-ending", status: "accept" }
      ],
      unresolvedFieldIds: []
    };
    await fs.writeFile(path.join(root, "sessions", "story-contract-adoption-proposal.json"), JSON.stringify(expanded), "utf8");
    const result = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-full", authorizationId: "auth-full" } });
    expect(result.status).toBe("committed");
    const project = JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8"));
    expect(project.storyContract.contract).toMatchObject({ conflict: { core: "The order erases evidence." }, stakes: { failureCost: "The last ally is lost." }, endingDirection: "Truth at irreversible cost." });
    expect(project.storyContract.worldRuleContractId).toBe("world-rule-1");
    const world = await fs.readFile(path.join(root, "bible", "world.md"), "utf8");
    expect(world).toContain("A charged anchor exists.");
    expect(world).toContain("nine-lotus-mountain");
  });

  it("stops writing when the fencing token is replaced and leaves recovery to the next owner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    const beforeProject = await fs.readFile(path.join(root, "project.json"), "utf8");
    const result = await commitContractAdoption(root, {
      expectedProposalFingerprint: proposal.fingerprint,
      authorization: { actorId: "author-fenced", authorizationId: "auth-fenced" },
      fenceAt: "after-first-write"
    });
    expect(result).toMatchObject({ status: "blocked", canonWritten: false, reason: "FENCING_TOKEN_LOST" });
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).not.toBe(beforeProject);
    expect(JSON.parse(await fs.readFile(path.join(root, "sessions", "mutations", "contract-adoption.lock"), "utf8"))).toMatchObject({ fencingToken: "replacement-token" });
    const recovered = await recoverContractMutations(root);
    expect(recovered).toHaveLength(1);
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(beforeProject);
  });

  it("does not reclaim a long-running lease when its heartbeat is fresh", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-canon-"));
    roots.push(root);
    const proposal = await setup(root);
    await fs.mkdir(path.join(root, "sessions", "mutations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "mutations", "contract-adoption.lock"), JSON.stringify({
      mutationId: "active-writer",
      fencingToken: "active-token",
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      heartbeatAt: new Date().toISOString()
    }), "utf8");
    const result = await commitContractAdoption(root, { expectedProposalFingerprint: proposal.fingerprint, authorization: { actorId: "author-heartbeat", authorizationId: "auth-heartbeat" } });
    expect(result).toMatchObject({ status: "blocked", reason: "MUTATION_LEASE_UNAVAILABLE" });
    expect(JSON.parse(await fs.readFile(path.join(root, "sessions", "mutations", "contract-adoption.lock"), "utf8"))).toMatchObject({ fencingToken: "active-token" });
  });
});
