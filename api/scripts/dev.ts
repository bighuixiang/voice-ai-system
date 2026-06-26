import { runDevSupervisor } from "../src/devSupervisor.js";

runDevSupervisor().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
