import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeShadowUnderstanding } from "./understandingExecutor.js";
import { buildUnderstandingRiskProfile } from "./understandingRiskProfile.js";

const manifest = { schemaVersion: "context-manifest.v1" as const, manifestId: "m-1", projectSlug: "p1", purpose: "understanding" as const, sourceSessionId: "s-1", sourceFingerprint: "fp-1", sourceMessages: [], frozenAt: new Date().toISOString() };
const session = { schemaVersion: "creative-session.v1" as const, sessionId: "s-1", projectSlug: "p1", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const budget = { schemaVersion: "understanding-budget.v1" as const, reservationId: "r-1", projectSlug: "p1", purpose: "creative-understanding" as const, units: 10, manifestFingerprint: "fp-1", status: "reserved" as const, providerCommit: false as const, reservedAt: new Date().toISOString(), fingerprint: "budget-fp" };
const capability = { schemaVersion: "model-capability-authorization.v1" as const, projectSlug: "p1", taskType: "creative-understanding" as const, capabilityFloor: "understanding.v1" as const, profileId: "p", provider: "test", availability: "verified" as const, status: "authorized" as const, modelCallAllowed: true, manifestFingerprint: "fp-1", riskProfileFingerprint: buildUnderstandingRiskProfile().fingerprint, budgetReservationId: "r-1", authorizedAt: new Date().toISOString(), fingerprint: "cap-fp" };

describe("understanding shadow executor gates", () => {
  it("fails closed when budget or capability authorization is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-executor-"));
    await expect(executeShadowUnderstanding({ root, projectSlug: "p1", session, manifest, riskProfile: buildUnderstandingRiskProfile(), budget: null as never, capability })).rejects.toThrow("UNDERSTANDING_BUDGET_REQUIRED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects authorization bound to a different frozen input", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-executor-"));
    await expect(executeShadowUnderstanding({ root, projectSlug: "p1", session, manifest, riskProfile: buildUnderstandingRiskProfile(), budget: { ...budget, manifestFingerprint: "other" }, capability })).rejects.toThrow("UNDERSTANDING_BUDGET_STALE");
    await fs.rm(root, { recursive: true, force: true });
  });
});
