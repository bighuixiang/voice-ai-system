import { spawn } from "node:child_process";

export interface CodexConfig {
  command: string;
  model?: string;
}

export interface CommandCheckResult {
  available: boolean;
  command: string;
  version?: string;
  error?: string;
}

export function resolveCodexCommand(config: Partial<CodexConfig> = {}): CodexConfig {
  return {
    command: config.command || process.env.CODEX_COMMAND || "codex",
    model: config.model || process.env.CODEX_MODEL
  };
}

export function checkCodexAvailability(config: Partial<CodexConfig> = {}): Promise<CommandCheckResult> {
  const resolved = resolveCodexCommand(config);
  return new Promise((resolve) => {
    const child = spawn(resolved.command, ["--version"], { shell: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ available: false, command: resolved.command, error: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ available: true, command: resolved.command, version: stdout.trim() });
      } else {
        resolve({ available: false, command: resolved.command, error: stderr.trim() || `Exit code ${code}` });
      }
    });
  });
}
