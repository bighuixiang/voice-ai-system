import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBookWorkGraph, readBookWorkGraph, refreshBookWorkGraph } from "./bookWorkGraph.js";

describe("book work graph", () => {
  it("keeps dependent chapters blocked until settlement projection appears", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-"));
    const graph = await createBookWorkGraph(root, "demo", ["c1", "c2", "c3"]);
    expect(graph.workItems.map((item) => item.status)).toEqual(["ready", "blocked", "blocked"]);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "s1.json"), JSON.stringify({ chapterId: "c1", settlementId: "s1", status: "settled" }), "utf8");
    const refreshed = await refreshBookWorkGraph(root);
    expect(refreshed.workItems.map((item) => item.status)).toEqual(["completed", "ready", "blocked"]);
    expect((await refreshBookWorkGraph(root)).fingerprint).toBe(refreshed.fingerprint);
    expect((await readBookWorkGraph(root))?.version).toBe(2);
  });
});
