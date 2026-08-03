import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAutonomyGrant, readAutonomyGrant, revokeAutonomyGrant, evaluateAutonomyGrant } from "./autonomyGrant.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("autonomy grant", () => {
  it("persists a bounded grant and evaluates expiry", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "autonomy-grant-")); roots.push(root);
    const grant = await createAutonomyGrant(root, { grantId: "grant-1", projectSlug: "demo", bookRunId: "run-1", chapterIds: ["c1"], autonomyLevel: "L1", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(grant).toMatchObject({ grantId: "grant-1", status: "active", chapterIds: ["c1"] });
    expect(evaluateAutonomyGrant(grant, Date.parse("2098-01-01T00:00:00.000Z"))).toMatchObject({ active: true });
    expect(evaluateAutonomyGrant(grant, Date.parse("2100-01-01T00:00:00.000Z"))).toMatchObject({ active: false, reason: "AUTONOMY_GRANT_EXPIRED" });
    await expect(readAutonomyGrant(root, grant.grantId)).resolves.toMatchObject({ fingerprint: grant.fingerprint });
  });

  it("revokes a grant with an auditable reason", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "autonomy-grant-revoke-")); roots.push(root);
    const grant = await createAutonomyGrant(root, { grantId: "grant-1", projectSlug: "demo", bookRunId: "run-1", chapterIds: ["c1"], autonomyLevel: "L1", expiresAt: "2099-01-01T00:00:00.000Z" });
    const revoked = await revokeAutonomyGrant(root, grant.grantId, "author-request");
    expect(revoked).toMatchObject({ status: "revoked", revokeReason: "author-request" });
    expect(evaluateAutonomyGrant(revoked)).toMatchObject({ active: false, reason: "AUTONOMY_GRANT_REVOKED" });
  });
});
