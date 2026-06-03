import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CodexConfig } from "./codexConfig.js";
import { getTempRoot } from "./workspace.js";

export interface CodexRunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  finalMessage: string;
  durationMs: number;
}

export interface ProcessRunner {
  run(prompt: string, projectRoot: string, config: CodexConfig): Promise<CodexRunOutput>;
}

export class CodexProcessRunner implements ProcessRunner {
  async run(prompt: string, projectRoot: string, config: CodexConfig): Promise<CodexRunOutput> {
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

    return new Promise((resolve, reject) => {
      const child = spawn(config.command, args, { shell: true });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", async (exitCode) => {
        let finalMessage = "";
        try {
          finalMessage = await fs.readFile(outputPath, "utf8");
        } catch {
          finalMessage = stdout;
        }
        resolve({
          stdout,
          stderr,
          exitCode,
          finalMessage,
          durationMs: Date.now() - startedAt
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
