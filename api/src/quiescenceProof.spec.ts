import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { issueQuiescenceProof, readQuiescenceProof } from "./quiescenceProof.js";
import { createBudgetReservation, persistBudgetReservation } from "./budgetReservation.js";
import { appendModelInvocation, createModelInvocationRecord } from "./modelInvocationLedger.js";

async function fixture(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), "quiescence-proof-")); }

describe("quiescence proof", () => {
  it("issues a replayable proof only when no active work or mutation lease exists", async () => {
    const root = await fixture();
    const proof = await issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 });
    expect(proof).toMatchObject({ schemaVersion: "quiescence-proof.v1", status: "quiescent", bookRunId: "book-run-1", runVersion: 2, activeWorkItemIds: [], activeMutationLeases: [] });
    expect(await readQuiescenceProof(root, "book-run-1")).toMatchObject({ fingerprint: proof.fingerprint });
  });

  it("fails closed while an execution work item is still queued", async () => {
    const root = await fixture();
    const itemBase = { schemaVersion: "execution-work-item.v1", workItemId: "work-1", projectSlug: "demo", chapterId: "c1", versionId: "v1", proofFingerprint: "p", contextManifestId: "m", contextFingerprint: "c", status: "queued", idempotencyKey: "i", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/execution-work-items/work-1.json"), JSON.stringify({ ...itemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(itemBase)).digest("hex") }));
    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });

  it("fails closed for blocked or failed work and invalidates an old proof when work appears", async () => {
    const root = await fixture();
    const proof = await issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 });
    const itemBase = { schemaVersion: "execution-work-item.v1", workItemId: "work-blocked", projectSlug: "demo", chapterId: "c1", versionId: "v1", proofFingerprint: "p", contextManifestId: "m", contextFingerprint: "c", status: "blocked", blockedReason: "PROOF_NOT_FOUND", idempotencyKey: "i", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/execution-work-items/work-blocked.json"), JSON.stringify({ ...itemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(itemBase)).digest("hex") }));
    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 2 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
    expect(await readQuiescenceProof(root, "book-run-1", 2)).toBeNull();
    expect(proof.status).toBe("quiescent");
  });

  it("does not let an unrelated book run block this run's quiescence", async () => {
    const root = await fixture();
    const itemBase = { schemaVersion: "execution-work-item.v1", workItemId: "other-work", projectSlug: "demo", chapterId: "c-other", versionId: "v1", proofFingerprint: "p", contextManifestId: "m", contextFingerprint: "c", status: "queued" as const, idempotencyKey: "other", createdAt: new Date().toISOString(), runId: "book-run-other" };
    await fs.mkdir(path.join(root, "sessions/execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/execution-work-items/other-work.json"), JSON.stringify({ ...itemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(itemBase)).digest("hex") }));

    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-current", runVersion: 1 })).resolves.toMatchObject({ activeWorkItemIds: [] });
  });

  it("treats cancelled work as settled for quiescence", async () => {
    const root = await fixture();
    const itemBase = { schemaVersion: "execution-work-item.v1", workItemId: "cancelled-work", projectSlug: "demo", chapterId: "c1", versionId: "v1", proofFingerprint: "p", contextManifestId: "m", contextFingerprint: "c", status: "cancelled" as const, idempotencyKey: "cancelled", createdAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/execution-work-items"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/execution-work-items/cancelled-work.json"), JSON.stringify({ ...itemBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(itemBase)).digest("hex") }));

    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).resolves.toMatchObject({ activeWorkItemIds: [] });
  });

  it("fails closed while a budget reservation remains active", async () => {
    const root = await fixture();
    await persistBudgetReservation(root, createBudgetReservation({ bookRunId: "book-run-1", projectSlug: "demo", runVersion: 1, limitCents: 100, reservedCents: 50 }));

    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });

  it("fails closed while a mutation plan is unresolved", async () => {
    const root = await fixture();
    await fs.mkdir(path.join(root, "sessions", "mutations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "mutations", "mutation-open.json"), JSON.stringify({ mutationId: "mutation-open", projectSlug: "demo", status: "committing" }));

    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });

  it("fails closed while a model invocation has an unknown settlement", async () => {
    const root = await fixture();
    await appendModelInvocation(root, createModelInvocationRecord({ invocationId: "inv-unknown", taskId: "task-unknown", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "provider://mock", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "unknown", usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, measurement: "estimated" }, cost: { amount: 0, currency: "USD", measurement: "estimated", estimateMethod: "unknown-settlement" }, cache: { hit: false }, adoptionDecision: "reconciliation-required" }));

    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });
  it("does not treat a malformed invocation settlement file as settled", async () => {
    const root = await fixture();
    await appendModelInvocation(root, createModelInvocationRecord({ invocationId: "inv-malformed", taskId: "task-malformed", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "provider://mock", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "unknown", usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, measurement: "estimated" }, cost: { amount: 0, currency: "USD", measurement: "estimated", estimateMethod: "unknown-settlement" }, cache: { hit: false }, adoptionDecision: "reconciliation-required" }));
    await fs.mkdir(path.join(root, "sessions/model-invocation-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/model-invocation-settlements/invocation-settlement-inv-malformed.json"), JSON.stringify({ invocationId: "inv-malformed", status: "settled" }));
    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });
  it("does not accept a valid settlement with the wrong invocation fingerprint", async () => {
    const root = await fixture();
    const invocation = createModelInvocationRecord({ invocationId: "inv-mismatch", taskId: "task-mismatch", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "provider://mock", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "unknown", usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, measurement: "estimated" }, cost: { amount: 0, currency: "USD", measurement: "estimated", estimateMethod: "unknown-settlement" }, cache: { hit: false }, adoptionDecision: "reconciliation-required" });
    await appendModelInvocation(root, invocation);
    const settlementBase = { schemaVersion: "model-invocation-settlement.v1", settlementId: "invocation-settlement-inv-mismatch", invocationId: "inv-mismatch", invocationFingerprint: "a".repeat(64), reservationId: "reservation-1", bookRunId: "book-run-1", projectSlug: "demo", consumedCents: 0, costMeasurement: "estimated", status: "settled", createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(root, "sessions/model-invocation-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/model-invocation-settlements/invocation-settlement-inv-mismatch.json"), JSON.stringify({ ...settlementBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(settlementBase)).digest("hex") }));
    await expect(issueQuiescenceProof(root, { bookRunId: "book-run-1", runVersion: 1 })).rejects.toThrow("QUIESCENCE_NOT_REACHED");
  });

  it("rejects a semantically forged proof even when its fingerprint is recomputed", async () => {
    const root = await fixture();
    const proof = await issueQuiescenceProof(root, { bookRunId: "book-run-forged", runVersion: 3 });
    const target = path.join(root, "sessions/book-runs", "book-run-forged.quiescence.v3.json");
    const forgedBase = { ...proof, status: "running" };
    const { fingerprint: _old, ...withoutFingerprint } = forgedBase;
    await fs.writeFile(target, JSON.stringify({ ...withoutFingerprint, fingerprint: crypto.createHash("sha256").update(JSON.stringify(withoutFingerprint)).digest("hex") }));
    await expect(readQuiescenceProof(root, "book-run-forged", 3)).resolves.toBeNull();
  });
  it("rejects a proof whose signed identity differs from the requested run", async () => {
    const root = await fixture();
    const proof = await issueQuiescenceProof(root, { bookRunId: "book-run-identity", runVersion: 3 });
    const target = path.join(root, "sessions/book-runs", "book-run-identity.quiescence.v3.json");
    const { fingerprint: _old, ...base } = proof;
    const forged = { ...base, bookRunId: "book-run-other", fingerprint: crypto.createHash("sha256").update(JSON.stringify({ ...base, bookRunId: "book-run-other" })).digest("hex") };
    await fs.writeFile(target, JSON.stringify(forged));
    await expect(readQuiescenceProof(root, "book-run-identity", 3)).resolves.toBeNull();
  });
});
