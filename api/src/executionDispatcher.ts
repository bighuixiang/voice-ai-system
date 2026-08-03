import { claimExecutionWorkItem, listExecutionWorkItems, type ExecutionWorkItem } from "./executionQueue.js";
import { createRuntimeRun, enqueueRuntimeCommand, updateRuntimeRun } from "./runtimeStore.js";
import { chapterDispatchFence } from "./bookRunControlFence.js";
import { assertCapabilityWriteAllowed } from "./capabilityWriteGate.js";
import { createBookRunAuthorityBinding, type ModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { assertModelInvocationBudget } from "./modelInvocationBudgetGate.js";
import { readProseGenerationManifest } from "./proseGenerationManifest.js";
import { assertCraftPatternReleaseRefs } from "./learningRelease.js";

export interface ExecutionDispatchReceipt {
  workItemId: string;
  status: "dispatched" | "skipped";
  runId?: string;
  reason?: string;
}

export async function dispatchQueuedExecutionWorkItems(root: string, projectSlug: string, options: { bookRunId?: string; chapterIds?: readonly string[]; workItemIds?: readonly string[]; maxActiveWorkItems?: number; frozenPublicationScopeRef?: string; budgetReservationId?: string; authorityBinding?: ModelInvocationAuthorityBinding } = {}): Promise<ExecutionDispatchReceipt[]> {
  const receipts: ExecutionDispatchReceipt[] = [];
  const allowedChapterIds = options.chapterIds ? new Set(options.chapterIds) : undefined;
  const allowedWorkItemIds = options.workItemIds ? new Set(options.workItemIds) : undefined;
  const allItems = await listExecutionWorkItems(root);
  const queuedItems = allItems.filter((item) => item.status === "queued" && item.projectSlug === projectSlug && (!allowedChapterIds || allowedChapterIds.has(item.chapterId)) && (!allowedWorkItemIds || allowedWorkItemIds.has(item.workItemId)));
  const activeWriteSets = new Set(allItems.filter((item) => item.projectSlug === projectSlug && ["claimed", "running"].includes(item.status)).map((item) => `chapter:${item.chapterId}`));
  const claimedWriteSets = new Set<string>();
  if (options.maxActiveWorkItems !== undefined) {
    const activeCount = (await listExecutionWorkItems(root)).filter((item) => item.projectSlug === projectSlug && (!allowedChapterIds || allowedChapterIds.has(item.chapterId)) && ["claimed", "running"].includes(item.status)).length;
    const remaining = options.maxActiveWorkItems - activeCount;
    if (remaining <= 0) return queuedItems.map((item) => ({ workItemId: item.workItemId, status: "skipped" as const, reason: "BOOK_RUN_ACTIVE_WORK_ITEM_LIMIT_EXCEEDED" }));
    if (queuedItems.length > remaining) queuedItems.splice(remaining);
  }
  try {
    await assertCapabilityWriteAllowed(root, projectSlug, "runtime");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return queuedItems.map((item) => ({ workItemId: item.workItemId, status: "skipped" as const, reason }));
  }
  let authorityBinding = options.authorityBinding;
  if (options.bookRunId && !authorityBinding) {
    try {
      authorityBinding = await createBookRunAuthorityBinding(root, { bookRunId: options.bookRunId, frozenPublicationScopeRef: options.frozenPublicationScopeRef });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return queuedItems.map((item) => ({ workItemId: item.workItemId, status: "skipped" as const, reason }));
    }
  }
  if (options.bookRunId) {
    try {
      await assertModelInvocationBudget(root, { bookRunId: options.bookRunId, budgetReservationId: options.budgetReservationId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return queuedItems.map((item) => ({ workItemId: item.workItemId, status: "skipped" as const, reason }));
    }
  }
  for (const item of queuedItems) {
    if (item.generationManifestId) {
      const manifest = await readProseGenerationManifest(root, item.generationManifestId);
      if (!manifest) {
        receipts.push({ workItemId: item.workItemId, status: "skipped", reason: "PROSE_GENERATION_MANIFEST_REQUIRED" });
        continue;
      }
      try {
        await assertCraftPatternReleaseRefs(root, projectSlug, manifest.craftPatternRefs);
      } catch (error) {
        receipts.push({ workItemId: item.workItemId, status: "skipped", reason: error instanceof Error ? error.message : "PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED" });
        continue;
      }
    }
    const writeSet = `chapter:${item.chapterId}`;
    if (activeWriteSets.has(writeSet) || claimedWriteSets.has(writeSet)) {
      receipts.push({ workItemId: item.workItemId, status: "skipped", reason: "EXECUTION_WRITE_SET_CONFLICT" });
      continue;
    }
    const fence = await chapterDispatchFence(root, projectSlug, item.chapterId);
    if (!fence.allowed) {
      receipts.push({ workItemId: item.workItemId, status: "skipped", reason: `BOOK_RUN_${String(fence.blockedBy).toUpperCase()}_FENCE` });
      continue;
    }
    const run = createRuntimeRun({
      projectSlug,
      chapterId: item.chapterId,
      payload: { chapterId: item.chapterId, requireExecutionReady: true, idempotencyKey: item.idempotencyKey, ...(item.generationManifestId ? { generationManifestId: item.generationManifestId } : {}), ...(options.bookRunId ? { bookRunId: options.bookRunId } : {}), ...(options.budgetReservationId ? { budgetReservationId: options.budgetReservationId } : {}), ...(authorityBinding ? { authorityBinding } : {}) }
    });
    const claimed = await claimExecutionWorkItem(root, item.workItemId, run.id);
    if (claimed.status !== "running" || claimed.runId !== run.id) {
      updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString(), error: "EXECUTION_WORK_ITEM_ALREADY_CLAIMED" });
      receipts.push({ workItemId: item.workItemId, status: "skipped", reason: claimed.status });
      continue;
    }
    claimedWriteSets.add(writeSet);
    enqueueRuntimeCommand({
      projectSlug,
      runId: run.id,
      type: "start",
      payload: { chapterId: item.chapterId, requireExecutionReady: true, idempotencyKey: item.idempotencyKey, ...(item.generationManifestId ? { generationManifestId: item.generationManifestId } : {}), ...(options.bookRunId ? { bookRunId: options.bookRunId } : {}), ...(options.budgetReservationId ? { budgetReservationId: options.budgetReservationId } : {}), ...(authorityBinding ? { authorityBinding } : {}) },
      idempotencyKey: `execution-dispatch-${item.workItemId}`
    });
    receipts.push({ workItemId: item.workItemId, status: "dispatched", runId: run.id });
  }
  return receipts;
}
