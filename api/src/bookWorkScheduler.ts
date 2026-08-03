import { createBookWorkGraph, refreshBookWorkGraph, readBookWorkGraph, type BookWorkGraph, type BookWorkItem } from "./bookWorkGraph.js";
import { enqueueExecutionWorkItem, type ExecutionWorkItem } from "./executionQueue.js";

export interface ReadyWorkScheduleReceipt {
  chapterId: string;
  workItem: ExecutionWorkItem;
}

export function orderReadyWorkItems(items: readonly BookWorkItem[], now = Date.now()): BookWorkItem[] {
  return items.filter((item) => item.status === "ready").slice().sort((left, right) => {
    const leftPriority = Number.isFinite(left.priority) ? left.priority! : 50;
    const rightPriority = Number.isFinite(right.priority) ? right.priority! : 50;
    const leftAge = left.createdAt ? Date.parse(left.createdAt) : now;
    const rightAge = right.createdAt ? Date.parse(right.createdAt) : now;
    return rightPriority - leftPriority || leftAge - rightAge || left.workItemId.localeCompare(right.workItemId);
  });
}

export function selectReadyWorkItems(items: readonly BookWorkItem[], options?: { maxItems?: number; allowedResourceClasses?: Array<NonNullable<BookWorkItem["resourceClass"]>>; maxByResourceClass?: Partial<Record<NonNullable<BookWorkItem["resourceClass"]>, number>> }): BookWorkItem[] {
  const readyItems = orderReadyWorkItems(items);
  const allowed = options?.allowedResourceClasses ? new Set(options.allowedResourceClasses) : undefined;
  const counts = new Map<string, number>();
  const filtered = readyItems.filter((item) => {
    const resourceClass = item.resourceClass || "model";
    if (allowed && !allowed.has(resourceClass)) return false;
    const limit = options?.maxByResourceClass?.[resourceClass];
    const used = counts.get(resourceClass) || 0;
    if (limit !== undefined && used >= Math.max(0, Math.floor(limit))) return false;
    counts.set(resourceClass, used + 1);
    return true;
  });
  return options?.maxItems === undefined ? filtered : filtered.slice(0, Math.max(0, Math.floor(options.maxItems)));
}

export async function scheduleReadyExecutionWork(root: string, projectSlug: string, options?: { maxItems?: number; allowedResourceClasses?: Array<NonNullable<BookWorkItem["resourceClass"]>>; maxByResourceClass?: Partial<Record<NonNullable<BookWorkItem["resourceClass"]>, number>> }): Promise<{ graph: BookWorkGraph; scheduled: ReadyWorkScheduleReceipt[] }> {
  let graph = await readBookWorkGraph(root);
  if (!graph) graph = await createBookWorkGraph(root, projectSlug, []);
  graph = await refreshBookWorkGraph(root);
  const scheduled: ReadyWorkScheduleReceipt[] = [];
  const selected = selectReadyWorkItems(graph.workItems, options);
  for (const item of selected) {
    const workItem = await enqueueExecutionWorkItem(root, projectSlug, item.chapterId, `book-graph-${graph.graphId}-v${graph.version}-${item.workItemId}`, { sourceBookWorkItemId: item.workItemId, sourceGraphFingerprint: graph.fingerprint });
    scheduled.push({ chapterId: item.chapterId, workItem });
  }
  return { graph, scheduled };
}
