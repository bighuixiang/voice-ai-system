import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, "..");
const vitestBin = path.join(apiRoot, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : vitestBin;
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", vitestBin, "--run", "src/realCodex.integration.spec.ts"]
  : ["--run", "src/realCodex.integration.spec.ts"];

const result = spawnSync(command, args, {
  cwd: apiRoot,
  env: {
    ...process.env,
    RUN_REAL_CODEX: "1"
  },
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
