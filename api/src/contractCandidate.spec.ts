import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileContractCandidate, readContractCandidate } from "./contractCandidate.js";
import { answerDialogueQuestion, createDialogueQuestion } from "./dialogueQuestions.js";

const roots: string[] = [];

async function makeDecision(root: string, answerText: string, answerStatus: "confirmed" | "tentative" = "confirmed", key = "decision-1") {
  await createDialogueQuestion(root, {
    projectSlug: "demo",
    questionId: "question-primary-desire",
    questionVersion: 1,
    text: "What does the protagonist want?",
    whyNow: "Opening contract.",
    impact: "high",
    ambiguity: 0.8,
    errorCost: "high",
    reversibility: "low",
    delayCost: "medium",
    options: [],
    recommendation: "Ask",
    snapshotFingerprint: "a".repeat(64)
  });
  return answerDialogueQuestion(root, {
    questionId: "question-primary-desire",
    questionVersion: 1,
    expectedSnapshotFingerprint: "a".repeat(64),
    idempotencyKey: key,
    answerText,
    answerStatus
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("contract candidate compiler", () => {
  it("compiles a confirmed decision into an isolated non-canon candidate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const decision = await makeDecision(root, "Expose the truth.");
    if (!decision.accepted || !decision.decision) throw new Error("decision setup failed");
    const result = await compileContractCandidate(root, decision.decision.decisionId);

    expect(result.candidate).toMatchObject({
      schemaVersion: "story-contract-candidate.v1",
      status: "candidate",
      canonWritten: false,
      sourceDecisionId: decision.decision.decisionId,
      fields: [expect.objectContaining({ path: "protagonist.primaryDesire", value: "Expose the truth.", epistemicStatus: "explicit" })]
    });
    await expect(fs.stat(path.join(root, "project.json"))).rejects.toThrow();
    expect(await readContractCandidate(root, result.candidate.candidateId)).toEqual(result.candidate);
  });

  it("keeps tentative answers provisional and marks superseded candidates stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const tentative = await makeDecision(root, "Maybe protect the sister.", "tentative", "decision-tentative");
    if (!tentative.accepted || !tentative.decision) throw new Error("decision setup failed");
    const first = await compileContractCandidate(root, tentative.decision.decisionId);
    expect(first.candidate.fields[0]).toMatchObject({ epistemicStatus: "provisional" });

    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 2,
      text: "What does the protagonist want?",
      whyNow: "Correction.",
      impact: "high",
      ambiguity: 0.4,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Correct",
      snapshotFingerprint: "a".repeat(64)
    });

    const corrected = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 2,
      expectedSnapshotFingerprint: "a".repeat(64),
      idempotencyKey: "decision-corrected",
      answerText: "不是保护，是揭露真相",
      answerStatus: "confirmed"
    });
    if (!corrected.accepted || !corrected.decision) throw new Error("correction setup failed");
    const second = await compileContractCandidate(root, corrected.decision.decisionId);
    expect(second.candidate).toMatchObject({ status: "candidate", supersedesCandidateId: first.candidate.candidateId });
    expect(await readContractCandidate(root, first.candidate.candidateId)).toMatchObject({ status: "stale" });
  });

  it("compiles a confirmed world-rule decision into the same field-bounded contract", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const primary = await makeDecision(root, "Expose the truth.");
    if (!primary.accepted || !primary.decision) throw new Error("decision setup failed");
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-world-rule",
      questionVersion: 1,
      text: "What rule governs the world?",
      whyNow: "World causality.",
      impact: "high",
      ambiguity: 0.6,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Ask",
      snapshotFingerprint: "a".repeat(64)
    });
    const world = await answerDialogueQuestion(root, {
      questionId: "question-world-rule",
      questionVersion: 1,
      expectedSnapshotFingerprint: "a".repeat(64),
      idempotencyKey: "world-rule-1",
      answerText: "Every gate demands an equal memory.",
      answerStatus: "confirmed"
    });
    if (!world.accepted || !world.decision) throw new Error("world decision setup failed");
    const result = await compileContractCandidate(root, primary.decision.decisionId);
    expect(result.candidate.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "protagonist.primaryDesire", value: "Expose the truth." }),
      expect.objectContaining({ path: "world.rules.primary", value: "Every gate demands an equal memory." })
    ]));
    expect(result.candidate.unknowns).not.toContain("primary world rule");
  });

  it("preserves materially different interpretation branches as attributed candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const decision = await makeDecision(root, "Expose the truth.", "confirmed", "decision-branches");
    if (!decision.accepted || !decision.decision) throw new Error("decision setup failed");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    const branchesSnapshotBase = {
      schemaVersion: "understanding-snapshot.v1",
      snapshotId: "snapshot-branches",
      projectSlug: "demo",
      mode: "shadow",
      sourceFingerprint: "b".repeat(64),
      sourceMessageIds: [],
      coreExplicit: [],
      inferred: [],
      unknowns: [],
      question: { id: "question-primary-desire", text: "What does the protagonist want?", status: "candidate", impact: "high", source: "deterministic-gap" },
      interpretationSet: {
        schemaVersion: "seed-interpretation-set.v1",
        commonClaims: [],
        activeQuestionId: "question-primary-desire",
        interpretations: [
          { id: "branch-revenge", label: "Revenge", summary: "The protagonist seeks revenge", status: "candidate", differences: ["revenge drives the core conflict"], supportEvidence: [], counterEvidence: [], downstreamImpacts: ["revenge arc", "late confrontation"] },
          { id: "branch-symbiosis", label: "Symbiosis", summary: "The protagonist accepts a costly symbiosis", status: "candidate", differences: ["symbiosis creates an ongoing cost"], supportEvidence: [], counterEvidence: [], downstreamImpacts: ["shared-cost arc", "relationship reversal"] }
        ]
      },
      modelCallIssued: false,
      canonWritten: false,
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(root, "sessions", "understanding-snapshot.json"), JSON.stringify({ ...branchesSnapshotBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(branchesSnapshotBase)).digest("hex") }, null, 2));

    const revenge = await compileContractCandidate(root, decision.decision.decisionId, "branch-revenge");
    const symbiosis = await compileContractCandidate(root, decision.decision.decisionId, "branch-symbiosis");
    expect(revenge.candidate.candidateId).not.toBe(symbiosis.candidate.candidateId);
    expect(revenge.candidate.variant).toMatchObject({ interpretationId: "branch-revenge", label: "Revenge" });
    expect(symbiosis.candidate.variant).toMatchObject({ interpretationId: "branch-symbiosis", label: "Symbiosis" });
    expect(revenge.candidate.contract.conflict.core).not.toBe(symbiosis.candidate.contract.conflict.core);
    expect(revenge.candidate.assumptions).toContain("revenge drives the core conflict");
    expect(symbiosis.candidate.impactSummary).toContain("relationship reversal");
  });

  it("records an incremental recompile trace and preserves unrelated field fingerprints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const primary = await makeDecision(root, "Expose the truth.", "confirmed", "decision-incremental-1");
    if (!primary.accepted || !primary.decision) throw new Error("decision setup failed");
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-world-rule",
      questionVersion: 1,
      text: "What rule governs the world?",
      whyNow: "World causality.",
      impact: "high",
      ambiguity: 0.6,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Ask",
      snapshotFingerprint: "a".repeat(64)
    });
    const world = await answerDialogueQuestion(root, {
      questionId: "question-world-rule",
      questionVersion: 1,
      expectedSnapshotFingerprint: "a".repeat(64),
      idempotencyKey: "decision-incremental-world",
      answerText: "Every gate demands an equal memory.",
      answerStatus: "confirmed"
    });
    if (!world.accepted || !world.decision) throw new Error("world decision setup failed");
    const first = await compileContractCandidate(root, primary.decision.decisionId);

    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 2,
      text: "What does the protagonist want?",
      whyNow: "Correction.",
      impact: "high",
      ambiguity: 0.4,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Correct",
      snapshotFingerprint: "a".repeat(64)
    });
    const corrected = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 2,
      expectedSnapshotFingerprint: "a".repeat(64),
      idempotencyKey: "decision-incremental-2",
      answerText: "Protect the living.",
      answerStatus: "confirmed"
    });
    if (!corrected.accepted || !corrected.decision) throw new Error("correction setup failed");
    const second = await compileContractCandidate(root, corrected.decision.decisionId);
    expect(second.candidate.recompile).toMatchObject({ mode: "incremental", affectedPaths: ["protagonist.primaryDesire"], preservedPaths: ["world.rules.primary"] });
    const preservedWorld = first.candidate.fields.find((field) => field.path === "world.rules.primary");
    expect(second.candidate.recompile?.preservedFingerprints["world.rules.primary"]).toBe(
      crypto.createHash("sha256").update(JSON.stringify({ path: preservedWorld?.path, value: preservedWorld?.value, evidenceRefs: preservedWorld?.evidenceRefs, sourceDecisionId: preservedWorld?.sourceDecisionId })).digest("hex")
    );
  });

  it("maps core contract decisions into the typed StoryContract skeleton", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contract-candidate-"));
    roots.push(root);
    const primary = await makeDecision(root, "Expose the truth.", "confirmed", "decision-full-schema-primary");
    if (!primary.accepted || !primary.decision) throw new Error("decision setup failed");
    const questions = [
      ["question-core-conflict", "What pressure opposes the protagonist?", "The order will erase the evidence."],
      ["question-failure-cost", "What is lost on failure?", "The protagonist loses their last ally."],
      ["question-ending-direction", "What direction should the ending take?", "The truth is exposed at an irreversible cost."]
    ] as const;
    const decisions: string[] = [];
    for (const [questionId, text, answerText] of questions) {
      await createDialogueQuestion(root, {
        projectSlug: "demo",
        questionId,
        questionVersion: 1,
        text,
        whyNow: "Complete the first contract scope.",
        impact: "high",
        ambiguity: 0.5,
        errorCost: "high",
        reversibility: "low",
        delayCost: "medium",
        options: [],
        recommendation: "Ask",
        snapshotFingerprint: "a".repeat(64)
      });
      const answered = await answerDialogueQuestion(root, {
        questionId,
        questionVersion: 1,
        expectedSnapshotFingerprint: "a".repeat(64),
        idempotencyKey: `${questionId}-answer`,
        answerText,
        answerStatus: "confirmed"
      });
      if (!answered.accepted || !answered.decision) throw new Error(`decision setup failed: ${questionId}`);
      decisions.push(answered.decision.decisionId);
    }
    const result = await compileContractCandidate(root, primary.decision.decisionId);
    expect(result.candidate.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "conflict.core", value: "The order will erase the evidence." }),
      expect.objectContaining({ path: "stakes.failureCost", value: "The protagonist loses their last ally." }),
      expect.objectContaining({ path: "endingDirection", value: "The truth is exposed at an irreversible cost." })
    ]));
    expect(result.candidate.contract.conflict.core).toBe("The order will erase the evidence.");
    expect(result.candidate.contract.stakes.failureCost).toBe("The protagonist loses their last ally.");
    expect(result.candidate.contract.endingDirection).toBe("The truth is exposed at an irreversible cost.");
    expect(decisions).toHaveLength(3);
  });
});
