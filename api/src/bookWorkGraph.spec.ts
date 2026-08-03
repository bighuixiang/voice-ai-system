import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBookWorkGraph, readBookWorkGraph, refreshBookWorkGraph } from "./bookWorkGraph.js";
import { recordChapterSettlementProjectionClosure } from "./chapterSettlementProjectionClosure.js";
import { createMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { recordMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

describe("book work graph", () => {
  it("keeps dependent chapters blocked until settlement projection appears", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-"));
    const graph = await createBookWorkGraph(root, "demo", ["c1", "c2", "c3"]);
    expect(graph.workItems.map((item) => item.status)).toEqual(["ready", "blocked", "blocked"]);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    const settlement = { schemaVersion: "chapter-settlement.v1", settlementId: "s1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "s1.json"), JSON.stringify({ ...settlement, fingerprint: hash(settlement) }), "utf8");
    const refreshed = await refreshBookWorkGraph(root);
    expect(refreshed.workItems.map((item) => item.status)).toEqual(["completed", "ready", "blocked"]);
    expect((await refreshBookWorkGraph(root)).fingerprint).toBe(refreshed.fingerprint);
    expect((await readBookWorkGraph(root))?.version).toBe(2);
  });

  it("ignores forged or cross-project settlement projections", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-integrity-"));
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "forged.json"), JSON.stringify({ chapterId: "c1", settlementId: "forged", status: "settled" }), "utf8");
    const foreign = { schemaVersion: "chapter-settlement.v1", settlementId: "foreign", projectSlug: "other", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "foreign.json"), JSON.stringify({ ...foreign, fingerprint: hash(foreign) }), "utf8");
    const refreshed = await refreshBookWorkGraph(root);
    expect(refreshed.workItems.map((item) => item.status)).toEqual(["ready", "blocked"]);
    expect(refreshed.version).toBe(1);
  });
  it("does not unlock from a re-signed but semantically invalid settlement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-semantic-settlement-"));
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    const invalid = { projectSlug: "demo", chapterId: "c1", settlementId: "invalid", status: "settled" as const };
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "invalid.json"), JSON.stringify({ ...invalid, fingerprint: hash(invalid) }));
    const refreshed = await refreshBookWorkGraph(root);
    expect(refreshed.workItems.map((item) => item.status)).toEqual(["ready", "blocked"]);
  });

  it("does not unlock an evidence-bound settlement until projection closure exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-closure-gate-"));
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    const settlement = { schemaVersion: "chapter-settlement.v1", settlementId: "s1", projectSlug: "demo", chapterId: "c1", adoptionTransactionId: "adopt-c1", adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", evidence: { adoptionReceiptRef: "adopt://c1", summaryRef: "summary://c1", obligationDeltaRef: "obligation://c1", projectionRef: "projection://pending", feedbackRef: "feedback://c1", costRef: "cost://c1" }, evidenceFingerprint: "", createdAt: new Date().toISOString() };
    settlement.evidenceFingerprint = hash(settlement.evidence);
    await fs.writeFile(path.join(root, "sessions", "chapter-settlements", "s1.json"), JSON.stringify({ ...settlement, fingerprint: hash(settlement) }), "utf8");
    expect((await refreshBookWorkGraph(root)).workItems.map((item) => item.status)).toEqual(["ready", "blocked"]);
    await recordChapterSettlementProjectionClosure({ root, projectSlug: "demo", chapterId: "c1", settlementId: "s1", derivedTransactionId: "derived-1", derivedFingerprint: "b".repeat(64) });
    expect((await refreshBookWorkGraph(root)).workItems.map((item) => item.status)).toEqual(["completed", "ready"]);
  });

  it("fails closed when the durable work graph is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-graph-tampered-"));
    const graph = await createBookWorkGraph(root, "demo", ["c1"]);
    const target = path.join(root, "sessions", "book-work-graph.json");
    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    persisted.version = 99;
    await fs.writeFile(target, JSON.stringify(persisted), "utf8");
    expect(graph.version).toBe(1);
    await expect(readBookWorkGraph(root)).rejects.toThrow("BOOK_WORK_GRAPH_INTEGRITY_FAILED");
  });

  it("rejects a re-signed graph with duplicate work identities", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-graph-semantic-"));
    const graph = await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    const target = path.join(root, "sessions", "book-work-graph.json");
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const items = base.workItems as Array<Record<string, unknown>>;
    const resigned = { ...base, workItems: [items[0], { ...items[1], workItemId: items[0].workItemId }] };
    await fs.writeFile(target, JSON.stringify({ ...resigned, fingerprint: hash(resigned) }));
    expect(graph.version).toBe(1);
    await expect(readBookWorkGraph(root)).rejects.toThrow("BOOK_WORK_GRAPH_INTEGRITY_FAILED");
  });

  it("materializes typed repair actions as dependency-bound work items", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "book-work-repair-"));
    await createBookWorkGraph(root, "demo", ["c1", "c2"]);
    const plan = await createMilestoneRepairPlan({ root, projectSlug: "demo", bookRunId: "book-1", runVersion: 1, sourceFingerprint: "source-1", scopedChapterIds: ["c1", "c2"], issues: [{ kind: "obligation", targetId: "obl-1", reason: "terminal evidence missing", evidenceRefs: ["audit://obl-1"] }] });
    const blocked = await refreshBookWorkGraph(root);
    const repair = blocked.workItems.find((item) => item.kind === "repair");
    expect(repair).toMatchObject({ repairPlanId: plan.planId, repairActionId: plan.actions[0].actionId, status: "blocked", dependencyWorkItemIds: ["book-draft-c1", "book-draft-c2"] });
    await fs.mkdir(path.join(root, "sessions", "chapter-settlements"), { recursive: true });
    for (const chapterId of ["c1", "c2"]) {
      const settlement = { schemaVersion: "chapter-settlement.v1", settlementId: `settlement-${chapterId}`, projectSlug: "demo", chapterId, adoptionTransactionId: `adopt-${chapterId}`, adoptedContentSha256: "a".repeat(64), status: "settled", nextAction: "schedule_dependency_ready_work", createdAt: new Date().toISOString() };
      await fs.writeFile(path.join(root, "sessions", "chapter-settlements", `${settlement.settlementId}.json`), JSON.stringify({ ...settlement, fingerprint: hash(settlement) }), "utf8");
    }
    const ready = await refreshBookWorkGraph(root);
    expect(ready.workItems.find((item) => item.kind === "repair")?.status).toBe("ready");
    await recordMilestoneRepairCompletion({ root, planId: plan.planId, actionId: plan.actions[0].actionId, projectSlug: "demo", bookRunId: "book-1", runVersion: 1, workItemId: `book-repair-${plan.actions[0].actionId}`, evidenceRefs: ["repair://obl-1"] });
    expect((await refreshBookWorkGraph(root)).workItems.find((item) => item.kind === "repair")?.status).toBe("completed");
  });
});
