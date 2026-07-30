import fs from "node:fs/promises";
import path from "node:path";
import { claimNextRuntimeCommand, recoverStaleRuntimeCommands, recoverStaleRuntimeRuns, touchRuntimeWorkerHeartbeat } from "./runtimeStore.js";
import { processRuntimeCommand } from "./runtimeEngine.js";
import { getNovelsRoot } from "./workspace.js";
import { dispatchQueuedExecutionWorkItems } from "./executionDispatcher.js";
import { recoverStaleExecutionWorkItems } from "./executionQueue.js";

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
  for (const entry of await fs.readdir(novelsRoot, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[])) {
    if (!entry.isDirectory()) continue;
    try {
      const recoveredItems = await recoverStaleExecutionWorkItems(path.join(novelsRoot, entry.name), staleExecutionWorkItemMs);
      if (recoveredItems.length) log(`failed ${recoveredItems.length} stale execution item(s) for ${entry.name}`);
      const dispatched = await dispatchQueuedExecutionWorkItems(path.join(novelsRoot, entry.name), entry.name);
      if (dispatched.length) log(`dispatched ${dispatched.filter((item) => item.status === "dispatched").length} execution item(s) for ${entry.name}`);
    } catch (error) {
      log(`execution dispatch skipped for ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
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
