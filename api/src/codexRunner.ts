import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AiAgentProfile } from "./types.js";
import { getTempRoot } from "./workspace.js";

export type AgentRunConfig = Pick<AiAgentProfile, "command" | "label" | "model" | "provider">;

export interface CodexRunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  finalMessage: string;
  durationMs: number;
  timedOut?: boolean;
  cancelled?: boolean;
}

export interface ProcessRunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ProcessRunner {
  run(prompt: string, projectRoot: string, config: AgentRunConfig, options?: ProcessRunOptions): Promise<CodexRunOutput>;
}

async function readFinalMessage(outputPath: string | undefined, fallback: string): Promise<string> {
  if (!outputPath) return fallback;
  try {
    return await fs.readFile(outputPath, "utf8");
  } catch {
    return fallback;
  }
}

function runAgentProcess(input: {
  child: ChildProcessWithoutNullStreams;
  prompt: string;
  startedAt: number;
  label: string;
  outputPath?: string;
  finalMessageFromStdout?: boolean;
  options?: ProcessRunOptions;
}): Promise<CodexRunOutput> {
  const { child, prompt, startedAt, label, outputPath, finalMessageFromStdout, options } = input;
  const timeoutMs = options?.timeoutMs;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let cancelled = false;
  let closed = false;
  let timeout: NodeJS.Timeout | undefined;
  let forceKillTimeout: NodeJS.Timeout | undefined;

  function requestKill(reason: "timeout" | "cancelled") {
    if (closed) return;
    if (reason === "timeout") {
      timedOut = true;
      stderr += stderr.endsWith("\n") || !stderr ? "" : "\n";
      stderr += `${label} timed out after ${timeoutMs}ms.`;
    } else {
      cancelled = true;
      stderr += stderr.endsWith("\n") || !stderr ? "" : "\n";
      stderr += `${label} was cancelled.`;
    }

    child.kill("SIGTERM");
    forceKillTimeout = setTimeout(() => {
      if (!closed) {
        child.kill("SIGKILL");
      }
    }, 5000);
  }

  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      cancelled = true;
    }

    const abortHandler = () => requestKill("cancelled");
    options?.signal?.addEventListener("abort", abortHandler, { once: true });

    if (timeoutMs && timeoutMs > 0) {
      timeout = setTimeout(() => requestKill("timeout"), timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (timedOut || cancelled) return;
      reject(error);
    });
    child.on("close", async (exitCode) => {
      closed = true;
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      options?.signal?.removeEventListener("abort", abortHandler);
      const finalMessage = finalMessageFromStdout ? stdout : await readFinalMessage(outputPath, stdout);
      resolve({
        stdout,
        stderr,
        exitCode,
        finalMessage,
        durationMs: Date.now() - startedAt,
        timedOut,
        cancelled
      });
    });

    if (cancelled) {
      requestKill("cancelled");
      return;
    }

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export class CodexProcessRunner implements ProcessRunner {
  async run(prompt: string, projectRoot: string, config: AgentRunConfig, options?: ProcessRunOptions): Promise<CodexRunOutput> {
    const startedAt = Date.now();
    await fs.mkdir(getTempRoot(), { recursive: true });
    const outputPath = path.join(getTempRoot(), `codex-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const args = [
      "exec",
      "--cd",
      projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-last-message",
      outputPath,
      "-"
    ];
    if (config.model) {
      args.splice(1, 0, "--model", config.model);
    }

    const child = spawn(config.command, args, { shell: true });
    return runAgentProcess({ child, prompt, startedAt, label: config.label, outputPath, options });
  }
}

export class ClaudeCodeProcessRunner implements ProcessRunner {
  async run(prompt: string, projectRoot: string, config: AgentRunConfig, options?: ProcessRunOptions): Promise<CodexRunOutput> {
    const startedAt = Date.now();
    const args = ["--print", "--output-format", "text", "--permission-mode", "dontAsk"];
    if (config.model) {
      args.push("--model", config.model);
    }

    const child = spawn(config.command, args, { cwd: projectRoot, shell: true });
    return runAgentProcess({ child, prompt, startedAt, label: config.label, finalMessageFromStdout: true, options });
  }
}

export class AgentProcessRunner implements ProcessRunner {
  private readonly codexRunner = new CodexProcessRunner();
  private readonly claudeRunner = new ClaudeCodeProcessRunner();

  run(prompt: string, projectRoot: string, config: AgentRunConfig, options?: ProcessRunOptions): Promise<CodexRunOutput> {
    if (config.provider === "claude-code") {
      return this.claudeRunner.run(prompt, projectRoot, config, options);
    }

    return this.codexRunner.run(prompt, projectRoot, config, options);
  }
}
