import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";

const temporaryEnvironmentKeys = ["TEMP", "TMP", "TMPDIR"] as const;
const originalTemporaryEnvironment = new Map(
  temporaryEnvironmentKeys.map((key) => [key, process.env[key]])
);

let testTemporaryRoot: string | undefined;

function restoreTemporaryEnvironment(): void {
  for (const key of temporaryEnvironmentKeys) {
    const value = originalTemporaryEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeAll(async () => {
  testTemporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "voice-ai-system-vitest-"));
  for (const key of temporaryEnvironmentKeys) process.env[key] = testTemporaryRoot;
});

afterAll(async () => {
  const root = testTemporaryRoot;
  restoreTemporaryEnvironment();
  if (root) await fs.rm(root, { recursive: true, force: true });
});
