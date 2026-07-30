import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readUnderstandingCapabilityAuthorization } from "./understandingAuthorization.js";

describe("understanding capability authorization persistence integrity", () => {
  it("fails closed when an authorization record is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "understanding-capability-"));
    const base = { schemaVersion: "model-capability-authorization.v1", projectSlug: "p1", taskType: "creative-understanding", capabilityFloor: "understanding.v1", profileId: "p", provider: "test", availability: "verified", status: "authorized", modelCallAllowed: true, manifestFingerprint: "fp-1", riskProfileFingerprint: "risk-1", budgetReservationId: "r-1", authorizedAt: new Date().toISOString() };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    const record = { ...base, fingerprint };
    const target = path.join(root, "sessions", "understanding-capability-authorization.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({ ...record, modelCallAllowed: false }), "utf8");
    await expect(readUnderstandingCapabilityAuthorization(root)).rejects.toThrow("UNDERSTANDING_CAPABILITY_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });
});
