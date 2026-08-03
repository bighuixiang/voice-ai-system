import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { adoptSeedFields, createSeedRecompileReceipt, persistSeedAdoption, persistSeedAdoptionRevocation, persistSeedRecompileReceipt, readSeedAdoption, readSeedAdoptionRevocations, readSeedRecompileReceipts, recompileSeedIncrementally, revokeSeedAdoption } from "./seedAdoption.js";

describe("seed adoption and incremental recompilation", () => {
  it("adopts only selected fields and keeps stable semantic ids for accepted fields", () => {
    const result = adoptSeedFields({ existing: [{ field: "protagonist", value: "courier", status: "adopted" }, { field: "ending", value: "unknown", status: "unknown" }], decisions: [{ field: "ending", value: "door remains open", decision: "accept" }, { field: "protagonist", value: "pilot", decision: "reject" }] });
    expect(result.fields.find((field) => field.field === "protagonist")?.value).toBe("courier");
    expect(result.fields.find((field) => field.field === "ending")?.status).toBe("adopted");
    expect(result.fields.find((field) => field.field === "ending")?.semanticId).toBeTruthy();
  });

  it("recompiles only affected fields and preserves unrelated adopted meanings", () => {
    const result = recompileSeedIncrementally({ fields: [{ field: "desire", value: "open door", version: 1 }, { field: "protagonist", value: "courier", version: 1 }], changedFields: ["desire"], dependencyMap: { desire: ["recent-conflict"], protagonist: [] } });
    expect(result.recompiled).toEqual(["desire"]);
    expect(result.preserved).toEqual(["protagonist"]);
  });

  it("follows transitive seed dependencies without touching unrelated fields", () => {
    const result = recompileSeedIncrementally({
      fields: [{ field: "a", value: "1", version: 1 }, { field: "b", value: "2", version: 1 }, { field: "c", value: "3", version: 1 }, { field: "unrelated", value: "4", version: 1 }],
      changedFields: ["a"],
      dependencyMap: { a: [], b: ["a"], c: ["b"], unrelated: [] }
    });
    expect(result.recompiled).toEqual(["a", "b", "c"]);
    expect(result.preserved).toEqual(["unrelated"]);
  });

  it("persists field-level adoption idempotently and detects tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-adoption-"));
    const result = adoptSeedFields({ existing: [{ field: "desire", value: "unknown", status: "unknown" }], decisions: [{ field: "desire", value: "open door", decision: "accept" }] });
    await expect(persistSeedAdoption(root, result)).resolves.toMatchObject({ created: true });
    await expect(persistSeedAdoption(root, result)).resolves.toMatchObject({ created: false });
    await expect(readSeedAdoption(root)).resolves.toEqual(result);
    await fs.writeFile(path.join(root, "sessions", "seed-adoption.json"), JSON.stringify({ ...result, rejected: ["forged"] }), "utf8");
    await expect(readSeedAdoption(root)).rejects.toThrow("SEED_ADOPTION_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects a validly hashed adoption containing duplicate semantic fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-adoption-duplicate-"));
    const base = { schemaVersion: "seed-adoption.v1", fields: [{ field: "desire", value: "one", status: "adopted" }, { field: "desire", value: "two", status: "adopted" }], rejected: [] };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "seed-adoption.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readSeedAdoption(root)).rejects.toThrow("SEED_ADOPTION_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects a forged semantic id that is not derived from its field name", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-adoption-semantic-id-"));
    const base = { schemaVersion: "seed-adoption.v1", fields: [{ field: "desire", value: "one", status: "adopted", semanticId: "seed-field-forged" }], rejected: [] };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "seed-adoption.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
    await expect(readSeedAdoption(root)).rejects.toThrow("SEED_ADOPTION_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("creates and persists a minimal, evidence-bound revocation receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-revocation-"));
    const adoption = adoptSeedFields({ existing: [{ field: "desire", value: "unknown", status: "unknown" }, { field: "protagonist", value: "courier", status: "adopted" }], decisions: [{ field: "desire", value: "open door", decision: "accept" }] });
    const receipt = revokeSeedAdoption({ adoption, field: "desire", reason: "author changed direction", dependencyMap: { desire: ["opening-conflict"], protagonist: [] } });
    expect(receipt.recompiledFields).toEqual(["desire"]);
    expect(receipt.affectedFields).toEqual(["opening-conflict"]);
    await expect(persistSeedAdoptionRevocation(root, receipt)).resolves.toMatchObject({ created: true });
    await expect(readSeedAdoptionRevocations(root)).resolves.toEqual([receipt]);
    expect(() => revokeSeedAdoption({ adoption, field: "missing", reason: "x", dependencyMap: {} })).toThrow("SEED_ADOPTION_FIELD_NOT_ADOPTED");
    const blocked = revokeSeedAdoption({ adoption, field: "desire", reason: "protected test", dependencyMap: { desire: ["opening-conflict"] }, protectedFields: ["opening-conflict"] });
    expect(blocked.protectedAffectedFields).toEqual(["opening-conflict"]);
    expect(blocked.blockers).toContain("PROTECTED_ASSET_AFFECTED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists a recompile receipt against the exact adoption baseline", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-recompile-"));
    const adoption = adoptSeedFields({ existing: [{ field: "desire", value: "unknown", status: "unknown" }], decisions: [{ field: "desire", value: "open door", decision: "accept" }] });
    const receipt = createSeedRecompileReceipt({ adoptionFingerprint: adoption.fingerprint, targetVersionId: "outline:v3", fields: [{ field: "desire", value: "open door", version: 1 }, { field: "protagonist", value: "courier", version: 1 }], changedFields: ["desire"], dependencyMap: { desire: [], protagonist: [] } });
    await expect(persistSeedRecompileReceipt(root, receipt)).resolves.toMatchObject({ created: true });
    await expect(readSeedRecompileReceipts(root)).resolves.toEqual([receipt]);
    expect(receipt.preservedFields).toEqual(["protagonist"]);
    expect(receipt.targetVersionId).toBe("outline:v3");
    expect(receipt.rollbackPoint).toMatch(/^rollback-seed-recompile-/);
    await fs.rm(root, { recursive: true, force: true });
  });
});
