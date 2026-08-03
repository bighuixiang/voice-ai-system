import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBookWorkGraph } from "./bookWorkGraph.js";
import { orderReadyWorkItems, scheduleReadyExecutionWork, selectReadyWorkItems } from "./bookWorkScheduler.js";

describe("book work scheduler", () => {
  it("orders ready work by repair priority, aging, and stable id", () => {
    const items = [
      { workItemId: "draft-new", chapterId: "c2", kind: "draft" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 50, createdAt: "2026-08-01T00:00:00.000Z" },
      { workItemId: "repair-old", chapterId: "c1", kind: "repair" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 80, createdAt: "2026-07-31T00:00:00.000Z" },
      { workItemId: "draft-old", chapterId: "c3", kind: "draft" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 50, createdAt: "2026-07-30T00:00:00.000Z" }
    ];
    expect(orderReadyWorkItems(items).map((item) => item.workItemId)).toEqual(["repair-old", "draft-old", "draft-new"]);
  });

  it("applies an explicit dispatch ceiling after ordering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-scheduler-limit-"));
    await createBookWorkGraph(root, "demo", ["c1"]);
    const result = await scheduleReadyExecutionWork(root, "demo", { maxItems: 0 });
    expect(result.scheduled).toHaveLength(0);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("filters resource classes and enforces per-class quotas", () => {
    const items = [
      { workItemId: "repair-1", chapterId: "c1", kind: "repair" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 80, resourceClass: "repair" as const },
      { workItemId: "model-1", chapterId: "c2", kind: "draft" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 50, resourceClass: "model" as const },
      { workItemId: "model-2", chapterId: "c3", kind: "draft" as const, dependencyWorkItemIds: [], status: "ready" as const, priority: 50, resourceClass: "model" as const }
    ];
    expect(selectReadyWorkItems(items, { allowedResourceClasses: ["model"], maxByResourceClass: { model: 1 } }).map((item) => item.workItemId)).toEqual(["model-1"]);
  });

  it("materializes ready graph items as blocked execution items when readiness context is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-scheduler-"));
    await createBookWorkGraph(root, "demo", ["c1"]);
    const result = await scheduleReadyExecutionWork(root, "demo");
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].workItem).toMatchObject({ chapterId: "c1", status: "blocked", blockedReason: "PROOF_NOT_FOUND", sourceBookWorkItemId: "book-draft-c1", sourceGraphFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
});
