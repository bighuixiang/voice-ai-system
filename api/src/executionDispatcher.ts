import { claimExecutionWorkItem, listExecutionWorkItems, type ExecutionWorkItem } from "./executionQueue.js";
import { createRuntimeRun, enqueueRuntimeCommand, updateRuntimeRun } from "./runtimeStore.js";

export interface ExecutionDispatchReceipt {
  workItemId: string;
  status: "dispatched" | "skipped";
  runId?: string;
  reason?: string;
}

export async function dispatchQueuedExecutionWorkItems(root: string, projectSlug: string): Promise<ExecutionDispatchReceipt[]> {
  const receipts: ExecutionDispatchReceipt[] = [];
  for (const item of await listExecutionWorkItems(root)) {
    if (item.status !== "queued") continue;
    const run = createRuntimeRun({
      projectSlug,
      chapterId: item.chapterId,
      payload: { chapterId: item.chapterId, requireExecutionReady: true, idempotencyKey: item.idempotencyKey }
    });
    const claimed = await claimExecutionWorkItem(root, item.workItemId, run.id);
    if (claimed.status !== "running" || claimed.runId !== run.id) {
      updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString(), error: "EXECUTION_WORK_ITEM_ALREADY_CLAIMED" });
      receipts.push({ workItemId: item.workItemId, status: "skipped", reason: claimed.status });
      continue;
    }
    enqueueRuntimeCommand({
      projectSlug,
      runId: run.id,
      type: "start",
      payload: { chapterId: item.chapterId, requireExecutionReady: true, idempotencyKey: item.idempotencyKey },
      idempotencyKey: `execution-dispatch-${item.workItemId}`
    });
    receipts.push({ workItemId: item.workItemId, status: "dispatched", runId: run.id });
  }
  return receipts;
}
