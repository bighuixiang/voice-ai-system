import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertMutationPlanIntegrity, createMutationPlan, persistMutationPlan, readMutationPlan, commitMutationPlan, rollbackMutationPlan, recoverMutationPlan, evaluateMutationPlan } from "./mutationPlan.js";

const sha = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

describe("mutation plan", () => {
  it("prepares an idempotent multi-asset plan with expected hashes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutation-plan-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "chapters", "c1.md"), "old prose", "utf8");
    await fs.writeFile(path.join(root, "memory.json"), "old memory", "utf8");
    const plan = createMutationPlan(root, {
      mutationId: "mutation-1", idempotencyKey: "idem-1", projectSlug: "demo", commandType: "chapter.settle", expectedProjectFingerprint: "project-v1",
      changes: [
        { relativePath: "chapters/c1.md", assetType: "canon", nextContent: "new prose", authoritative: true },
        { relativePath: "memory.json", assetType: "projection", nextContent: "new memory", authoritative: false }
      ], domainEvents: ["chapter.settled"], projectionUpdates: ["memory.rebuild"], postCommitJobs: ["index.refresh"]
    });
    expect(plan).toMatchObject({ schemaVersion: "mutation-plan.v1", status: "prepared" });
    expect(plan.changes[0]).toMatchObject({ expectedSha256: sha("old prose"), nextSha256: sha("new prose") });
    await expect(persistMutationPlan(root, plan)).resolves.toMatchObject({ fingerprint: plan.fingerprint });
    await expect(persistMutationPlan(root, plan)).resolves.toMatchObject({ mutationId: "mutation-1" });
  });

  it("commits all assets atomically at the captured baseline and rejects stale writes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutation-plan-"));
    await fs.writeFile(path.join(root, "a.txt"), "A", "utf8");
    await fs.writeFile(path.join(root, "b.txt"), "B", "utf8");
    const plan = createMutationPlan(root, { mutationId: "mutation-2", idempotencyKey: "idem-2", projectSlug: "demo", commandType: "test", expectedProjectFingerprint: "p", changes: [{ relativePath: "a.txt", assetType: "canon", nextContent: "A2", authoritative: true }, { relativePath: "b.txt", assetType: "projection", nextContent: "B2", authoritative: false }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] });
    await persistMutationPlan(root, plan);
    const committed = await commitMutationPlan(root, plan.mutationId);
    expect(committed).toMatchObject({ status: "committed", committedAt: expect.any(String) });
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("A2");
    const stale = createMutationPlan(root, { ...({ mutationId: "mutation-3", idempotencyKey: "idem-3", projectSlug: "demo", commandType: "test", expectedProjectFingerprint: "p", changes: [{ relativePath: "a.txt", assetType: "canon", nextContent: "A3", authoritative: true }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] }) });
    await persistMutationPlan(root, stale);
    await fs.writeFile(path.join(root, "a.txt"), "external", "utf8");
    await expect(commitMutationPlan(root, stale.mutationId)).rejects.toThrow("MUTATION_BASELINE_CONFLICT");
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("external");
  });

  it("returns per-item adoption outcomes without mutating canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutation-plan-preflight-"));
    await fs.writeFile(path.join(root, "a.txt"), "A", "utf8");
    await fs.writeFile(path.join(root, "b.txt"), "B", "utf8");
    const plan = createMutationPlan(root, { mutationId: "mutation-preflight", idempotencyKey: "idem-preflight", projectSlug: "demo", commandType: "test", expectedProjectFingerprint: "p", changes: [{ relativePath: "a.txt", assetType: "canon", nextContent: "A2", authoritative: true }, { relativePath: "b.txt", assetType: "projection", nextContent: "B2", authoritative: false }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] });
    await fs.writeFile(path.join(root, "b.txt"), "external", "utf8");
    const result = evaluateMutationPlan(root, plan);
    expect(result).toMatchObject({ status: "conflict", committed: false });
    expect(result.items).toEqual([
      expect.objectContaining({ relativePath: "a.txt", status: "accepted" }),
      expect.objectContaining({ relativePath: "b.txt", status: "conflict" })
    ]);
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("A");
  });

  it("rolls back committed changes and converges an interrupted plan", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutation-plan-"));
    await fs.writeFile(path.join(root, "a.txt"), "A", "utf8");
    const plan = createMutationPlan(root, { mutationId: "mutation-4", idempotencyKey: "idem-4", projectSlug: "demo", commandType: "test", expectedProjectFingerprint: "p", changes: [{ relativePath: "a.txt", assetType: "canon", nextContent: "A4", authoritative: true }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] });
    await persistMutationPlan(root, plan);
    await commitMutationPlan(root, plan.mutationId);
    await expect(rollbackMutationPlan(root, plan.mutationId)).resolves.toMatchObject({ status: "rolled_back" });
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("A");
    const recovered = await recoverMutationPlan(root, plan.mutationId);
    expect(recovered).toMatchObject({ status: "rolled_back" });
    const read = await readMutationPlan(root, plan.mutationId);
    expect(read?.status).toBe("rolled_back");
  });
  it("rejects a re-signed plan with inconsistent change hashes", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutation-plan-integrity-")); await fs.writeFile(path.join(root, "a.txt"), "A", "utf8"); const plan = createMutationPlan(root, { mutationId: "mutation-integrity", idempotencyKey: "idem", projectSlug: "demo", commandType: "test", expectedProjectFingerprint: "p", changes: [{ relativePath: "a.txt", assetType: "canon", nextContent: "A2", authoritative: true }], domainEvents: [], projectionUpdates: [], postCommitJobs: [] }); const { fingerprint: _fingerprint, ...base } = plan; const invalidBase = { ...base, changes: [{ ...base.changes[0], nextContent: "tampered" }] }; const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") }; expect(() => assertMutationPlanIntegrity(invalid as typeof plan)).toThrow("MUTATION_PLAN_INTEGRITY_FAILED"); });
});
