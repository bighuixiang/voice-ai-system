import { createBookWorkGraph, refreshBookWorkGraph, readBookWorkGraph, type BookWorkGraph } from "./bookWorkGraph.js";
import { enqueueExecutionWorkItem, type ExecutionWorkItem } from "./executionQueue.js";

export interface ReadyWorkScheduleReceipt {
  chapterId: string;
  workItem: ExecutionWorkItem;
}

export async function scheduleReadyExecutionWork(root: string, projectSlug: string): Promise<{ graph: BookWorkGraph; scheduled: ReadyWorkScheduleReceipt[] }> {
  let graph = await readBookWorkGraph(root);
  if (!graph) graph = await createBookWorkGraph(root, projectSlug, []);
  graph = await refreshBookWorkGraph(root);
  const scheduled: ReadyWorkScheduleReceipt[] = [];
  for (const item of graph.workItems.filter((candidate) => candidate.status === "ready")) {
    const workItem = await enqueueExecutionWorkItem(root, projectSlug, item.chapterId, `book-graph-${graph.graphId}-v${graph.version}-${item.chapterId}`);
    scheduled.push({ chapterId: item.chapterId, workItem });
  }
  return { graph, scheduled };
}
