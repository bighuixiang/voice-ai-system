import { createApp } from "./app.js";
import { getNovelsRoot } from "./workspace.js";
import { AgentProcessRunner } from "./codexRunner.js";
import { recoverUnderstandingTasksAtStartup } from "./understandingWorker.js";
import { recoverContractMutationsAtStartup } from "./contractCanonAdoption.js";

const port = Number(process.env.NOVEL_API_PORT || 8787);

void recoverContractMutationsAtStartup(getNovelsRoot()).catch((error) => console.error("Contract mutation recovery failed:", error));

void recoverUnderstandingTasksAtStartup(getNovelsRoot(), new AgentProcessRunner())
  .then((results) => {
    const recovered = results.flatMap((result) => result.recoveredTaskIds);
    if (recovered.length > 0) console.log(`Recovered understanding tasks at startup: ${recovered.join(", ")}`);
    const failures = results.filter((result) => result.error);
    if (failures.length > 0) console.error(`Understanding startup recovery degraded for ${failures.length} project(s).`);
  })
  .catch((error) => console.error("Understanding startup recovery failed:", error));

createApp().listen(port, "127.0.0.1", () => {
  console.log(`Novel Codex API listening on http://127.0.0.1:${port}`);
});
