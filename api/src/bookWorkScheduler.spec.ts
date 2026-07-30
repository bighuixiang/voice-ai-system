import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBookWorkGraph } from "./bookWorkGraph.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";

describe("book work scheduler", () => {
  it("materializes ready graph items as blocked execution items when readiness context is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-scheduler-"));
    await createBookWorkGraph(root, "demo", ["c1"]);
    const result = await scheduleReadyExecutionWork(root, "demo");
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].workItem).toMatchObject({ chapterId: "c1", status: "blocked", blockedReason: "PROOF_NOT_FOUND" });
  });
});
