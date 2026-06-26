import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DevWatchSpec {
  name: "api-server" | "runtime-worker";
  entry: string;
  watch: boolean;
}

export function createDevWatchSpecs(): DevWatchSpec[] {
  return [
    { name: "api-server", entry: "src/server.ts", watch: true },
    { name: "runtime-worker", entry: "src/runtimeWorker.ts", watch: true }
  ];
}

function resolveApiRoot(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

function tsxCliPath(apiRoot: string): string {
  return path.join(apiRoot, "node_modules", "tsx", "dist", "cli.mjs");
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

export async function runDevSupervisor(importMetaUrl = import.meta.url): Promise<void> {
  const apiRoot = resolveApiRoot(importMetaUrl);
  const tsxCli = tsxCliPath(apiRoot);
  const specs = createDevWatchSpecs();
  let stopping = false;
  const children = new Map<string, ChildProcess>();

  const stopAll = (signal: NodeJS.Signals = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    }
  };

  process.on("SIGINT", () => stopAll("SIGINT"));
  process.on("SIGTERM", () => stopAll("SIGTERM"));

  const watchers = specs.map((spec) => {
    const args = [tsxCli];
    if (spec.watch) args.push("watch");
    args.push(spec.entry);

    const child = spawn(process.execPath, args, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env
    });
    children.set(spec.name, child);

    return new Promise<void>((resolve, reject) => {
      child.once("error", (error) => {
        stopAll();
        reject(error);
      });
      child.once("exit", (code, signal) => {
        if (stopping) {
          resolve();
          return;
        }
        stopAll();
        reject(new Error(`${spec.name} exited unexpectedly (${signal ?? code ?? "unknown"})`));
      });
    });
  });

  try {
    await Promise.race(watchers);
  } finally {
    stopAll();
    await Promise.all([...children.values()].map((child) => waitForChildExit(child)));
  }
}
