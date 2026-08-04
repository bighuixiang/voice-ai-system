import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchQueuedExecutionWorkItems } from "./executionDispatcher.js";
import { enqueueExecutionWorkItem, readExecutionWorkItem } from "./executionQueue.js";
import { startBookRun, controlBookRun } from "./bookRun.js";
import { createProjectCapabilityManifest } from "./deliveryGovernance.js";
import { writeProjectCapabilityManifest } from "./projectCapabilityManifest.js";
import { createFrozenPublicationScope } from "./frozenPublicationScope.js";
import { getRuntimeRun } from "./runtimeStore.js";
import { createBudgetReservation, persistBudgetReservation } from "./budgetReservation.js";
import { createProseGenerationManifest, persistProseGenerationManifest } from "./proseGenerationManifest.js";

const roots: string[] = [];
afterEach(async () => { delete process.env.NOVEL_DB_PATH; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-dispatch-")); roots.push(root);
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "execution-dispatch-db-"));
  process.env.NOVEL_DB_PATH = path.join(dataRoot, "runtime.sqlite");
  await fs.mkdir(path.join(root, "sessions", "outline-versions"), { recursive: true });
  await fs.mkdir(path.join(root, "sessions", "outline-candidates"), { recursive: true });
  const versionBase = { schemaVersion: "outline-version.v1", versionId: "outline-version-v1", projectSlug: "demo", version: 1, outlineId: "outline-1", outlineFingerprint: "outline-fp", selectedChapterIds: ["c1"], strongFreezeCount: 1, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "active", canonWritten: true, createdAt: new Date().toISOString() };
  const version = { ...versionBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(versionBase)).digest("hex") };
  const proofBase = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-1", projectSlug: "demo", versionId: version.versionId, versionFingerprint: version.fingerprint, structureVersionFingerprint: "outline-fp", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-proof-1", status: "ready", executionReady: true, checks: [], createdAt: new Date().toISOString() };
  const proof = { ...proofBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(proofBase)).digest("hex") };
  await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint } }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-versions", "v1.json"), JSON.stringify(version), "utf8");
  await fs.writeFile(path.join(root, "sessions", "outline-candidates", "outline-1.json"), JSON.stringify({ fingerprint: "outline-fp" }), "utf8");
  await fs.writeFile(path.join(root, "sessions", "execution-ready-proof.json"), JSON.stringify(proof), "utf8");
  await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify({ manifestId: "context-1", sourceFingerprint: "context-fp" }), "utf8");
  return root;
}

describe("execution dispatcher", () => {
  it("claims a queued execution item and emits one runtime command bound to its run", async () => {
    const root = await fixture();
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "book-idem");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts).toEqual([expect.objectContaining({ workItemId: item.workItemId, status: "dispatched" })]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "running", runId: receipts[0].runId }));
  });

  it("dispatches only the requested project and never drains another project's queue", async () => {
    const root = await fixture();
    const own = await enqueueExecutionWorkItem(root, "demo", "c1", "project-scope-own");
    const foreign = await enqueueExecutionWorkItem(root, "other-project", "c1", "project-scope-foreign");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts.map((receipt) => receipt.workItemId)).toEqual([own.workItemId]);
    expect(await readExecutionWorkItem(root, own.workItemId)).toEqual(expect.objectContaining({ status: "running" }));
    expect(await readExecutionWorkItem(root, foreign.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("honors the run-level active work-item ceiling", async () => {
    const root = await fixture();
    const first = await enqueueExecutionWorkItem(root, "demo", "c1", "active-ceiling-1");
    const firstReceipt = await dispatchQueuedExecutionWorkItems(root, "demo", { maxActiveWorkItems: 1 });
    expect(firstReceipt[0]).toMatchObject({ workItemId: first.workItemId, status: "dispatched" });
    const second = await enqueueExecutionWorkItem(root, "demo", "c1", "active-ceiling-2");
    const blocked = await dispatchQueuedExecutionWorkItems(root, "demo", { maxActiveWorkItems: 1 });
    expect(blocked).toEqual([{ workItemId: second.workItemId, status: "skipped", reason: "BOOK_RUN_ACTIVE_WORK_ITEM_LIMIT_EXCEEDED" }]);
    expect(await readExecutionWorkItem(root, second.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("can dispatch only the fair-scheduler-selected work item without draining the project queue", async () => {
    const root = await fixture();
    const first = await enqueueExecutionWorkItem(root, "demo", "c1", "fair-selected");
    const second = await enqueueExecutionWorkItem(root, "demo", "c1", "fair-deferred");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo", { workItemIds: [second.workItemId] });
    expect(receipts).toEqual([expect.objectContaining({ workItemId: second.workItemId, status: "dispatched" })]);
    expect(await readExecutionWorkItem(root, first.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("does not dispatch two active work items that share a chapter write set", async () => {
    const root = await fixture();
    const first = await enqueueExecutionWorkItem(root, "demo", "c1", "write-set-first");
    const firstReceipt = await dispatchQueuedExecutionWorkItems(root, "demo", { workItemIds: [first.workItemId] });
    expect(firstReceipt[0]).toMatchObject({ status: "dispatched" });
    const second = await enqueueExecutionWorkItem(root, "demo", "c1", "write-set-second");
    const blocked = await dispatchQueuedExecutionWorkItems(root, "demo", { workItemIds: [second.workItemId] });
    expect(blocked).toEqual([{ workItemId: second.workItemId, status: "skipped", reason: "EXECUTION_WRITE_SET_CONFLICT" }]);
    expect(await readExecutionWorkItem(root, second.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("does not dispatch new work after a book-run stop fence", async () => {
    const root = await fixture();
    const run = await startBookRun(root, { projectSlug: "demo", chapterIds: ["c1"], autonomyLevel: "L1", limits: { maxWorkItems: 1 } });
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "book-stop-fence");
    const stopped = await controlBookRun(root, run.bookRunId, { action: "stop", expectedVersion: run.version });
    expect(stopped.status).toBe("stopped");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts).toEqual([]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "cancelled" }));
    const finalized = await controlBookRun(root, run.bookRunId, { action: "stop", expectedVersion: stopped.version });
    expect(finalized.status).toBe("stopped");
  });

  it("fails closed instead of dispatching a governed work item without a complete authority binding", async () => {
    const root = await fixture();
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "governed-binding-required");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo", { bookRunId: "book-run-governed" });
    expect(receipts).toEqual([{ workItemId: item.workItemId, status: "skipped", reason: "MODEL_INVOCATION_AUTHORITY_BINDING_UNAVAILABLE" }]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("passes the constructed authority binding into the runtime run", async () => {
    const root = await fixture();
    const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const storyBase = { schemaVersion: "story-contract.v1", status: "committed", canonWritten: true };
    const outlineBase = { schemaVersion: "outline-version.v1", status: "active", canonWritten: true, selectedChapterIds: ["c1"] };
    const story = { ...storyBase, fingerprint: hash(storyBase) };
    const outline = { ...outlineBase, fingerprint: hash(outlineBase) };
    const manifest = { schemaVersion: "context-manifest.v1", manifestId: "context-1", projectSlug: "demo", purpose: "understanding", sourceSessionId: "session-1", sourceFingerprint: "source-1", sourceMessages: [], blocks: [], frozenAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "story-contract.json"), JSON.stringify(story));
    await fs.writeFile(path.join(root, "sessions", "outline-versions", "outline-1.json"), JSON.stringify(outline));
    await fs.mkdir(path.join(root, "planning"), { recursive: true });
    await fs.writeFile(path.join(root, "planning", "length-forecast.json"), JSON.stringify({ schemaVersion: "length-forecast.v1", projectSlug: "demo", fingerprint: "d".repeat(64) }));
    await fs.writeFile(path.join(root, "sessions", "context-manifest.json"), JSON.stringify(manifest));
    const scope = await createFrozenPublicationScope({ root, projectSlug: "demo", chapterIds: ["c1"], scopeFingerprint: "a".repeat(64), evidence: { storyContract: { status: "bound", ref: "sessions/story-contract.json", fingerprint: story.fingerprint }, outlineVersion: { status: "bound", ref: "sessions/outline-versions/outline-1.json", fingerprint: outline.fingerprint } } });
    await persistBudgetReservation(root, createBudgetReservation({ bookRunId: "book-run-governed", projectSlug: "demo", runVersion: 1, limitCents: 100 }));
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "governed-binding-propagation");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo", { bookRunId: "book-run-governed", frozenPublicationScopeRef: `sessions/publication-scopes/${scope.scopeId}.json`, budgetReservationId: "budget-book-run-governed-v1" });
    expect(receipts[0].status).toBe("dispatched");
    const runtime = getRuntimeRun(receipts[0].runId!);
    expect(runtime?.input).toEqual(expect.objectContaining({ bookRunId: "book-run-governed", authorityBinding: expect.objectContaining({ bookRunId: "book-run-governed" }) }));
    expect(item.status).toBe("queued");
  });

  it("does not dispatch queued work when the project manifest omits runtime write authority", async () => {
    const root = await fixture();
    await writeProjectCapabilityManifest(root, createProjectCapabilityManifest({ projectId: "demo", schemaVersion: "v1", enabledSlices: ["story-seed"], readable: ["story-seed"], writable: ["story-seed"], migrationStatus: "verified", rollbackWindow: "24h", missingDependencies: [] }));
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "capability-dispatch-fence");
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts).toEqual([{ workItemId: item.workItemId, status: "skipped", reason: "CAPABILITY_WRITE_NOT_AUTHORIZED:runtime" }]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });

  it("fails closed when a queued generation manifest consumes a validated craft pattern without an active release", async () => {
    const root = await fixture();
    const patternBase = {
      schemaVersion: "craft-pattern.v1",
      patternId: "craft-dispatch-pattern",
      projectSlug: "demo",
      name: "dispatch pattern",
      mechanism: "delayed reveal",
      narrativeFunction: "raise tension",
      applicability: ["chapter"],
      counterexamples: ["no reveal"],
      sourceEnvelopeIds: ["source-1"],
      evidenceRefs: ["evidence-1"],
      lifecycle: "validated",
      status: "candidate",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      validation: { experimentId: "experiment-1", actor: "author", reason: "validated", validatedAt: new Date().toISOString() }
    } as const;
    const pattern = { ...patternBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(patternBase)).digest("hex") };
    await fs.mkdir(path.join(root, "sessions", "craft-patterns"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${pattern.patternId}.json`), JSON.stringify(pattern), "utf8");
    const manifest = createProseGenerationManifest({ manifestId: "generation-dispatch-release", decisionConsumptionReceiptRef: "receipt:dispatch", storyContractRef: "contract:dispatch", outlineVersion: "outline-version-v1", chapterIntentRef: "intent:c1", sceneCardRefs: ["scene:c1"], characterStateRefs: ["state:c1"], povStateRef: "pov:c1", obligationRefs: ["obligation:c1"], authorLockRefs: ["lock:c1"], craftPatternRefs: [pattern.patternId], latestAuthorDirection: "preserve the promise", proseBaselineRef: "prose:c1:v0", planningHorizonRef: "horizon:c1", contextManifestRef: "context-1", sourceRefs: ["runtime://dispatch"] });
    await persistProseGenerationManifest(root, manifest);
    const item = await enqueueExecutionWorkItem(root, "demo", "c1", "dispatch-release-required", { generationManifestId: manifest.manifestId });
    const receipts = await dispatchQueuedExecutionWorkItems(root, "demo");
    expect(receipts).toEqual([{ workItemId: item.workItemId, status: "skipped", reason: "PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED" }]);
    expect(await readExecutionWorkItem(root, item.workItemId)).toEqual(expect.objectContaining({ status: "queued" }));
  });
});
