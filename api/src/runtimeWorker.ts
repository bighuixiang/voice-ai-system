import fs from "node:fs/promises";
import path from "node:path";
import { claimNextRuntimeCommand, recoverStaleRuntimeCommands, recoverStaleRuntimeRuns, touchRuntimeWorkerHeartbeat } from "./runtimeStore.js";
import { processRuntimeCommand } from "./runtimeEngine.js";
import { getNovelsRoot } from "./workspace.js";
import { dispatchQueuedExecutionWorkItems } from "./executionDispatcher.js";
import { listExecutionWorkItems, recoverStaleExecutionWorkItems } from "./executionQueue.js";
import { selectFairWorkItems } from "./fairScheduler.js";

const pollIntervalMs = Number(process.env.RUNTIME_WORKER_POLL_MS || 1500);
const staleCommandMs = Number(process.env.RUNTIME_WORKER_STALE_MS || 10 * 60 * 1000);
const staleExecutionWorkItemMs = Number(process.env.RUNTIME_WORKER_EXECUTION_STALE_MS || staleCommandMs);
const heartbeatIntervalMs = Math.min(Math.max(1000, pollIntervalMs), 5000);
const workerStaleAfterMs = Math.max(pollIntervalMs * 4, 15_000);
let stopping = false;

function log(message: string): void {
  process.stdout.write(`[runtime-worker] ${new Date().toISOString()} ${message}\n`);
}

export async function runtimeWorkerTick(): Promise<void> {
  touchRuntimeWorkerHeartbeat({
    heartbeatAt: new Date().toISOString(),
    pollIntervalMs,
    staleAfterMs: workerStaleAfterMs
  });
  const recovered = recoverStaleRuntimeCommands(staleCommandMs);
  if (recovered) {
    log(`recovered ${recovered} stale command${recovered === 1 ? "" : "s"}`);
  }
  const recoveredRuns = recoverStaleRuntimeRuns(staleCommandMs);
  if (recoveredRuns) {
    log(`moved ${recoveredRuns} stale run${recoveredRuns === 1 ? "" : "s"} to review`);
  }
  const novelsRoot = getNovelsRoot();
  const projectEntries = (await fs.readdir(novelsRoot, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[])).filter((entry) => entry.isDirectory());
  for (const entry of projectEntries) {
    if (!entry.isDirectory()) continue;
    try {
      const recoveredItems = await recoverStaleExecutionWorkItems(path.join(novelsRoot, entry.name), staleExecutionWorkItemMs);
      if (recoveredItems.length) log(`failed ${recoveredItems.length} stale execution item(s) for ${entry.name}`);
    } catch (error) {
      log(`execution recovery skipped for ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const candidates = [];
  for (const entry of projectEntries) {
    try {
      for (const item of await listExecutionWorkItems(path.join(novelsRoot, entry.name))) {
        if (item.status !== "queued") continue;
        candidates.push({ workItemId: item.workItemId, projectSlug: entry.name, priority: 50, waitedMs: Math.max(0, Date.now() - Date.parse(item.createdAt)), dependenciesReady: true, budgetAllowed: true });
      }
    } catch (error) {
      log(`execution queue read skipped for ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const configuredSlots = Number(process.env.RUNTIME_WORKER_DISPATCH_SLOTS || projectEntries.length || 1);
  const fairSlots = Number.isInteger(configuredSlots) && configuredSlots > 0 ? configuredSlots : Math.max(1, projectEntries.length);
  const selected = selectFairWorkItems({ maxSlots: fairSlots, candidates });
  for (const candidate of selected) {
    try {
      const dispatched = await dispatchQueuedExecutionWorkItems(path.join(novelsRoot, candidate.projectSlug), candidate.projectSlug, { workItemIds: [candidate.workItemId], maxActiveWorkItems: 1 });
      if (dispatched.length) log(`dispatched ${dispatched.filter((item) => item.status === "dispatched").length} execution item(s) for ${candidate.projectSlug}`);
    } catch (error) {
      log(`execution dispatch skipped for ${candidate.projectSlug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const command = claimNextRuntimeCommand();
  if (!command) return;
  touchRuntimeWorkerHeartbeat({
    heartbeatAt: new Date().toISOString(),
    lastCommandClaimedAt: new Date().toISOString(),
    pollIntervalMs,
    staleAfterMs: workerStaleAfterMs
  });
  log(`claimed ${command.type} ${command.id}${command.runId ? ` run=${command.runId}` : ""}`);
  await processRuntimeCommand(command);
}

export async function runRuntimeWorkerLoop(): Promise<void> {
  touchRuntimeWorkerHeartbeat({
    heartbeatAt: new Date().toISOString(),
    pollIntervalMs,
    staleAfterMs: workerStaleAfterMs
  });
  const heartbeatTimer = setInterval(() => {
    touchRuntimeWorkerHeartbeat({
      heartbeatAt: new Date().toISOString(),
      pollIntervalMs,
      staleAfterMs: workerStaleAfterMs
    });
  }, heartbeatIntervalMs);
  log(`started, polling every ${pollIntervalMs}ms`);
  try {
    while (!stopping) {
      try {
        await runtimeWorkerTick();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`error: ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
  log("stopped");
}

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

if (process.env.RUNTIME_WORKER_AUTOSTART !== "0") {
  void runRuntimeWorkerLoop();
}
