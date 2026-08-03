import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBudgetReservation, persistBudgetReservation } from "./budgetReservation.js";
import { assertModelInvocationBudget, estimateModelInvocationCostCents, planValueFirstCostReduction } from "./modelInvocationBudgetGate.js";
import { appendModelInvocation, createModelInvocationRecord } from "./modelInvocationLedger.js";
import { createModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("model invocation budget gate", () => {
  it("blocks a governed call without an active reservation or beyond remaining cents", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "model-budget-gate-"));
    roots.push(root);
    await expect(assertModelInvocationBudget(root, { bookRunId: "book-run-1", budgetReservationId: "missing", estimatedCostCents: 1 })).rejects.toThrow("MODEL_INVOCATION_BUDGET_RESERVATION_NOT_FOUND");
    const reservation = createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 3, reservedCents: 2 });
    await persistBudgetReservation(root, reservation);
    await expect(assertModelInvocationBudget(root, { bookRunId: "book-run-1", budgetReservationId: reservation.reservationId, estimatedCostCents: 3 })).rejects.toThrow("BUDGET_HARD_STOP");
    await expect(assertModelInvocationBudget(root, { bookRunId: "book-run-1", budgetReservationId: reservation.reservationId, estimatedCostCents: 2 })).resolves.toMatchObject({ reservationId: reservation.reservationId });
  });

  it("never estimates a provider call as free when usage is unavailable", () => {
    expect(estimateModelInvocationCostCents({ promptChars: 0, outputChars: 0 })).toBe(1);
    expect(estimateModelInvocationCostCents({ promptChars: 8000, outputChars: 2000 })).toBe(3);
  });
  it("counts pending ledger cost before settlement in the hard stop", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "model-budget-pending-")); roots.push(root); const reservation = createBudgetReservation({ bookRunId: "book-run-pending", projectSlug: "demo", runVersion: 1, limitCents: 5, reservedCents: 5 }); await persistBudgetReservation(root, reservation); const authorityBinding = createModelInvocationAuthorityBinding({ bookRunId: "book-run-pending", frozenPublicationScopeRef: "scope.json", frozenPublicationScopeFingerprint: "a".repeat(64), storyContractRef: "story.json", storyContractFingerprint: "b".repeat(64), outlineRef: "outline.json", outlineFingerprint: "c".repeat(64), forecastRef: "forecast.json", forecastFingerprint: "d".repeat(64), contextManifestRef: "manifest.json", contextManifestFingerprint: "e".repeat(64) }); const record = createModelInvocationRecord({ invocationId: "pending-1", bookRunId: "book-run-pending", budgetReservationId: reservation.reservationId, authorityBinding, taskId: "task-pending", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "model-1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "completed", usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.04, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "not-adopted" }); await appendModelInvocation(root, record); await expect(assertModelInvocationBudget(root, { bookRunId: "book-run-pending", budgetReservationId: reservation.reservationId, estimatedCostCents: 2 })).rejects.toThrow("BUDGET_HARD_STOP"); });
  it("uses value-first savings without sacrificing hard guards", () => { const plan = planValueFirstCostReduction({ budgetTight: true, cacheAvailable: true, optionalAudit: true, candidateCount: 3, hardGuards: ["T0", "POV", "foreshadowing", "independent-review"] }); expect(plan.actions).toEqual(["reuse-cache", "compress-context", "reduce-candidates", "defer-optional-audit"]); expect(plan.preservedGuards).toContain("T0"); expect(plan.sacrificed).toEqual(["optional-audit-latency"]); expect(() => planValueFirstCostReduction({ budgetTight: true, cacheAvailable: false, optionalAudit: false, candidateCount: 1, hardGuards: [] })).toThrow("VALUE_COST_PLAN_INPUT_INVALID"); });
});
