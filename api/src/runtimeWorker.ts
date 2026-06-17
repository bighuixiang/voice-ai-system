import { claimNextRuntimeCommand, recoverStaleRuntimeCommands, recoverStaleRuntimeRuns } from "./runtimeStore.js";
import { processRuntimeCommand } from "./runtimeEngine.js";

const pollIntervalMs = Number(process.env.RUNTIME_WORKER_POLL_MS || 1500);
const staleCommandMs = Number(process.env.RUNTIME_WORKER_STALE_MS || 10 * 60 * 1000);
let stopping = false;

function log(message: string): void {
  process.stdout.write(`[runtime-worker] ${new Date().toISOString()} ${message}\n`);
}

async function tick(): Promise<void> {
  const recovered = recoverStaleRuntimeCommands(staleCommandMs);
  if (recovered) {
    log(`recovered ${recovered} stale command${recovered === 1 ? "" : "s"}`);
  }
  const recoveredRuns = recoverStaleRuntimeRuns(staleCommandMs);
  if (recoveredRuns) {
    log(`moved ${recoveredRuns} stale run${recoveredRuns === 1 ? "" : "s"} to review`);
  }
  const command = claimNextRuntimeCommand();
  if (!command) return;
  log(`claimed ${command.type} ${command.id}${command.runId ? ` run=${command.runId}` : ""}`);
  await processRuntimeCommand(command);
}

async function loop(): Promise<void> {
  log(`started, polling every ${pollIntervalMs}ms`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`error: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  log("stopped");
}

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

void loop();
