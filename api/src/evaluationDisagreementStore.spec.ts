import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decideEvaluationDisagreement } from "./evaluationDisagreement.js";
import { persistEvaluationDisagreement, readPersistedEvaluationDisagreement } from "./evaluationDisagreementStore.js";

describe("evaluation disagreement store", () => {
  it("persists and replays an immutable disagreement decision", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-disagreement-store-"));
    const decision = decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.8 }, { verdict: "tie", confidence: 0.6 }], impact: "ordinary", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true });
    await expect(persistEvaluationDisagreement(root, { disagreementId: "disagreement-1", projectSlug: "demo", decision })).resolves.toMatchObject({ created: true });
    await expect(readPersistedEvaluationDisagreement(root, "disagreement-1")).resolves.toMatchObject({ projectSlug: "demo", decision });
    await expect(persistEvaluationDisagreement(root, { disagreementId: "disagreement-1", projectSlug: "demo", decision })).resolves.toMatchObject({ created: false });
  });

  it("fails closed when a persisted disagreement is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-disagreement-store-tamper-"));
    const decision = decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.8 }, { verdict: "reject", confidence: 0.6 }], impact: "elevated", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true });
    await persistEvaluationDisagreement(root, { disagreementId: "disagreement-tamper", projectSlug: "demo", decision });
    const target = path.join(root, "evaluations", "disagreements", "disagreement-tamper.json");
    const tampered = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    (tampered.decision as Record<string, unknown>).confidence = 0.1;
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readPersistedEvaluationDisagreement(root, "disagreement-tamper")).rejects.toThrow("EVALUATION_DISAGREEMENT_INTEGRITY_FAILED");
  });

  it("rejects a rehashed record with an invalid creation timestamp", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-disagreement-store-time-"));
    const decision = decideEvaluationDisagreement({ verdicts: [{ verdict: "accept", confidence: 0.8 }, { verdict: "tie", confidence: 0.6 }], impact: "ordinary", hardGatesPassed: true, authorGoalMatched: true, protectedItemRegression: false, autonomyAuthorized: true });
    const base = { schemaVersion: "persisted-evaluation-disagreement.v1" as const, disagreementId: "disagreement-time", projectSlug: "demo", decision, createdAt: "not-a-date" };
    const record = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
    await fs.mkdir(path.join(root, "evaluations", "disagreements"), { recursive: true });
    await fs.writeFile(path.join(root, "evaluations", "disagreements", "disagreement-time.json"), JSON.stringify(record), "utf8");
    await expect(readPersistedEvaluationDisagreement(root, "disagreement-time")).rejects.toThrow("EVALUATION_DISAGREEMENT_STORE_INTEGRITY_FAILED");
  });
});
