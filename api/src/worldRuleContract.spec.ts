import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorldRuleContract,
  evaluateWorldRuleApplicability,
  readWorldRuleContract,
  type WorldRuleContractInput
} from "./worldRuleContract.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function validInput(): WorldRuleContractInput {
  return {
    projectSlug: "demo",
    sourceCandidateId: "contract-candidate-demo",
    sourceFingerprint: "a".repeat(64),
    proposition: {
      condition: "A trained caster has a charged anchor.",
      mechanism: "The anchor folds a bounded path.",
      result: "The caster crosses to the linked point.",
      cost: "The caster loses one day of lifespan.",
      limit: "One crossing per anchor per day.",
      failure: "Without an anchor the attempt collapses and causes pain."
    },
    scope: {
      subjects: ["trained-caster"],
      regions: ["nine-lotus-mountain"],
      time: { from: "chapter-001", to: "chapter-999" }
    },
    disclosure: {
      objectiveStatus: "unknown",
      domains: [
        { domainId: "church", kind: "institution_belief", claim: "The church says the power is divine." },
        { domainId: "author", kind: "author_proposal", claim: "The actual mechanism is anchor geometry." }
      ]
    },
    evidenceRefs: [{ kind: "dialogue-question", refId: "question-world-rule" }]
  };
}

describe("WorldRuleContract", () => {
  it("requires executable boundaries and keeps the contract non-canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-rule-contract-"));
    roots.push(root);
    const result = await createWorldRuleContract(root, validInput());
    expect(result.contract).toMatchObject({
      schemaVersion: "world-rule-contract.v1",
      status: "candidate",
      canonWritten: false,
      proposition: { condition: expect.any(String), mechanism: expect.any(String), cost: expect.any(String), failure: expect.any(String) },
      scope: { regions: ["nine-lotus-mountain"] }
    });
    expect(await readWorldRuleContract(root, result.contract.ruleId)).toEqual(result.contract);
  });

  it("does not flatten belief or proposal into objective truth", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-rule-contract-"));
    roots.push(root);
    const input = validInput();
    const result = await createWorldRuleContract(root, input);
    expect(result.contract.disclosure.objectiveStatus).toBe("unknown");
    expect(result.contract.disclosure.domains.find((domain) => domain.domainId === "church")).toMatchObject({ kind: "institution_belief" });
    expect(result.contract.disclosure.domains.find((domain) => domain.domainId === "author")).toMatchObject({ kind: "author_proposal" });
  });

  it("returns unknown outside the declared region instead of globalizing a regional rule", async () => {
    const contract = await createWorldRuleContract("/tmp/world-rule-test", validInput(), { persist: false });
    expect(evaluateWorldRuleApplicability(contract.contract, { region: "nine-lotus-mountain", chapter: "chapter-010" })).toBe("applicable");
    expect(evaluateWorldRuleApplicability(contract.contract, { region: "alan-continent", chapter: "chapter-010" })).toBe("unknown");
  });

  it("derives a stable worldRuleId from the source identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-rule-contract-"));
    roots.push(root);
    const first = await createWorldRuleContract(root, validInput(), { persist: false });
    const second = await createWorldRuleContract(root, validInput(), { persist: false });
    expect(second.contract.ruleId).toBe(first.contract.ruleId);
  });
});
