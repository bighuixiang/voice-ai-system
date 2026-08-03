import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendModelInvocation, assertModelInvocationRecordIntegrity, createModelInvocationRecord, evaluateInvocationBudget, readModelInvocations, retryClassFor } from "./modelInvocationLedger.js";
import { assertModelInvocationSettlementIntegrity, persistModelInvocationSettlement, settleModelInvocation, settlePersistedModelInvocation } from "./modelInvocationSettlement.js";
import { createBudgetReservation } from "./budgetReservation.js";
import { createModelInvocationAuthorityBinding, verifyModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";

const authorityBinding = createModelInvocationAuthorityBinding({
  bookRunId: "book-run-1",
  frozenPublicationScopeRef: "sessions/publication-scopes/scope-1.json",
  frozenPublicationScopeFingerprint: "a".repeat(64),
  storyContractRef: "sessions/story-contract.json",
  storyContractFingerprint: "b".repeat(64),
  outlineRef: "sessions/outline.json",
  outlineFingerprint: "c".repeat(64),
  forecastRef: "planning/length-forecast.json",
  forecastFingerprint: "d".repeat(64),
  contextManifestRef: "sessions/context-manifest.json",
  contextManifestFingerprint: "e".repeat(64)
});

const input = { invocationId: "inv-1", taskId: "task-1", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "model-cap-1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "completed" as const, usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 2, measurement: "actual" as const }, cost: { amount: 0.01, currency: "USD", measurement: "actual" as const }, cache: { hit: false }, adoptionDecision: "not-adopted" };

describe("model invocation ledger", () => {
  it("settles a model invocation only against its matching run reservation", () => {
    const invocation = createModelInvocationRecord({ ...input, bookRunId: "book-run-1", budgetReservationId: "budget-book-run-1-v1", authorityBinding });
    const reservation = createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 1000, reservedCents: 500 });
    const settlement = settleModelInvocation({ invocation, reservation });
    expect(settlement).toMatchObject({ status: "settled", invocationId: invocation.invocationId, reservationId: reservation.reservationId, consumedCents: 1 });
    expect(() => settleModelInvocation({ invocation: { ...invocation, budgetReservationId: "budget-other" }, reservation })).toThrow("MODEL_INVOCATION_RESERVATION_MISMATCH");
  });

  it("rejects a governed invocation that has no frozen authority binding", () => {
    expect(() => createModelInvocationRecord({ ...input, bookRunId: "book-run-1", budgetReservationId: "budget-book-run-1-v1" })).toThrow("MODEL_INVOCATION_AUTHORITY_BINDING_REQUIRED");
  });

  it("fails closed when a bound authority file is missing or has changed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-authority-"));
    for (const [ref, fingerprint] of [[authorityBinding.frozenPublicationScopeRef, authorityBinding.frozenPublicationScopeFingerprint], [authorityBinding.storyContractRef, authorityBinding.storyContractFingerprint], [authorityBinding.outlineRef, authorityBinding.outlineFingerprint], [authorityBinding.forecastRef, authorityBinding.forecastFingerprint], [authorityBinding.contextManifestRef, authorityBinding.contextManifestFingerprint]] as const) {
      await fs.mkdir(path.dirname(path.join(root, ref)), { recursive: true });
      await fs.writeFile(path.join(root, ref), JSON.stringify({ fingerprint }), "utf8");
    }
    await fs.mkdir(path.join(root, "sessions", "book-runs"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "book-runs", "book-run-1.json"), "{}", "utf8");
    await expect(verifyModelInvocationAuthorityBinding(root, authorityBinding)).resolves.toBeUndefined();
    await fs.writeFile(path.join(root, authorityBinding.outlineRef), JSON.stringify({ fingerprint: "0".repeat(64) }), "utf8");
    await expect(verifyModelInvocationAuthorityBinding(root, authorityBinding)).rejects.toThrow("MODEL_INVOCATION_AUTHORITY_STALE");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists an idempotent settlement receipt and closes the reservation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-settlement-"));
    const invocation = createModelInvocationRecord({ ...input, invocationId: "inv-settle-1", bookRunId: "book-run-1", budgetReservationId: "budget-book-run-1-v1", authorityBinding });
    const reservation = createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 1000, reservedCents: 500 });
    await appendModelInvocation(root, invocation);
    const settlement = settleModelInvocation({ invocation, reservation });
    const first = await persistModelInvocationSettlement(root, settlement, reservation);
    expect(first.reservation.status).toBe("settled");
    const second = await settlePersistedModelInvocation(root, invocation.invocationId, reservation.reservationId);
    expect(second.settlement).toEqual(settlement);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects a settlement whose project scope differs from its reservation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-settlement-scope-"));
    const invocation = createModelInvocationRecord({ ...input, invocationId: "inv-scope-1", bookRunId: "book-run-1", budgetReservationId: "budget-book-run-1-v1", authorityBinding });
    const reservation = createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 1000, reservedCents: 500 });
    const settlement = settleModelInvocation({ invocation, reservation });
    const { fingerprint: _fingerprint, ...base } = settlement;
    const scopedBase = { ...base, projectSlug: "other-project" };
    const scoped = { ...scopedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(scopedBase)).digest("hex") };
    await expect(persistModelInvocationSettlement(root, scoped, reservation)).rejects.toThrow("MODEL_INVOCATION_SETTLEMENT_SCOPE_MISMATCH");
    await fs.rm(root, { recursive: true, force: true });
  });
  it("creates append-only replayable records and rejects silent corruption", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-ledger-"));
    const record = createModelInvocationRecord(input);
    await appendModelInvocation(root, record);
    expect(await readModelInvocations(root)).toEqual([record]);
    await fs.appendFile(path.join(root, "sessions", "model-invocations.jsonl"), "not-json\n", "utf8");
    await expect(readModelInvocations(root)).rejects.toThrow("MODEL_INVOCATION_LEDGER_CORRUPT");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("classifies only bounded transient failures as retryable and hard-stops budget overflow", () => {
    expect(retryClassFor("timeout")).toBe("transient");
    expect(retryClassFor("authentication")).toBe("non-retryable");
    expect(evaluateInvocationBudget({ hardLimit: 100, committed: 80, reserved: 20, nextEstimate: 1 })).toMatchObject({ allowed: false, reason: "BUDGET_HARD_STOP" });
  });

  it("persists cache hit savings and invalidation reason in the invocation record", () => {
    const record = createModelInvocationRecord({ ...input, cache: { hit: false, key: "cache-1", savedTokens: 12, invalidationReason: "MODEL_VERSION_CHANGED" } });
    expect(record.cache).toMatchObject({ savedTokens: 12, invalidationReason: "MODEL_VERSION_CHANGED" });
  });
  it("rejects a re-signed settlement with negative consumed cents", () => { const invocation = createModelInvocationRecord({ ...input, bookRunId: "book-run-1", budgetReservationId: "budget-book-run-1-v1", authorityBinding }); const reservation = createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 1000, reservedCents: 500 }); const settlement = settleModelInvocation({ invocation, reservation }); const { fingerprint: _fingerprint, ...base } = settlement; const invalidBase = { ...base, consumedCents: -1 }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertModelInvocationSettlementIntegrity(invalid as typeof settlement)).toThrow("MODEL_INVOCATION_SETTLEMENT_INTEGRITY_FAILED"); });
  it("rejects invalid accounting fields and append-time tampering", async () => { expect(() => createModelInvocationRecord({ ...input, cost: { amount: Number.NaN, currency: "USD", measurement: "actual" } })).toThrow("MODEL_INVOCATION_USAGE_INVALID"); const record = createModelInvocationRecord(input); expect(() => assertModelInvocationRecordIntegrity({ ...record, cost: { ...record.cost, amount: -1 } })).toThrow("MODEL_INVOCATION_LEDGER_INTEGRITY_FAILED"); const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-invalid-")); await expect(appendModelInvocation(root, { ...record, fingerprint: "forged" })).rejects.toThrow("MODEL_INVOCATION_LEDGER_INTEGRITY_FAILED"); await fs.rm(root, { recursive: true, force: true }); });
  it("rejects a re-signed record with negative usage or invalid timestamps", () => { const record = createModelInvocationRecord(input); const { fingerprint: _fingerprint, ...base } = record; const invalidBase = { ...base, usage: { ...base.usage, outputTokens: -1 }, startedAt: "not-a-time" }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertModelInvocationRecordIntegrity(invalid as typeof record)).toThrow("MODEL_INVOCATION_LEDGER_INTEGRITY_FAILED"); });
});
