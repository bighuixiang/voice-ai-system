import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertEvaluationAccessGrantCurrent, createEvaluationAccessGrant, persistEvaluationAccessGrant, readEvaluationAccessGrant, revokeEvaluationAccessGrant } from "./evaluationAccess.js";

describe("evaluation access grants", () => {
  it("requires minimized and anonymized authorization before platform regression use", () => {
    expect(() => createEvaluationAccessGrant({ projectSlug: "demo", use: "platform-regression", sourceRefs: ["source://chapter-1"], minimized: false, anonymized: true })).toThrow("EVALUATION_ACCESS_PRIVACY_REQUIRED");
    const grant = createEvaluationAccessGrant({ projectSlug: "demo", use: "platform-regression", sourceRefs: ["source://chapter-1"], minimized: true, anonymized: true });
    expect(grant).toMatchObject({ use: "platform-regression", minimized: true, anonymized: true, status: "active" });
  });

  it("makes revocation exclude future runs while preserving an audit record", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-access-"));
    try {
      const grant = createEvaluationAccessGrant({ projectSlug: "demo", use: "platform-regression", sourceRefs: ["source://chapter-1"], minimized: true, anonymized: true });
      await expect(persistEvaluationAccessGrant(root, grant)).resolves.toMatchObject({ created: true });
      await expect(assertEvaluationAccessGrantCurrent(root, grant.grantId, { projectSlug: "demo", use: "platform-regression" })).resolves.toMatchObject({ status: "active" });
      const revoked = await revokeEvaluationAccessGrant(root, grant.grantId, "Author withdrew platform reuse.");
      expect(revoked.status).toBe("revoked");
      await expect(assertEvaluationAccessGrantCurrent(root, grant.grantId, { projectSlug: "demo", use: "platform-regression" })).rejects.toThrow("EVALUATION_ACCESS_REVOKED");
      await expect(readEvaluationAccessGrant(root, grant.grantId)).resolves.toMatchObject({ status: "revoked", revocationReason: "Author withdrew platform reuse." });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it("fails closed when a grant is re-signed without revocation evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "evaluation-access-tampered-"));
    const grant = createEvaluationAccessGrant({ projectSlug: "demo", use: "platform-regression", sourceRefs: ["source://chapter-1"], minimized: true, anonymized: true });
    await persistEvaluationAccessGrant(root, grant);
    const target = path.join(root, "evaluations", "access-grants", `${grant.grantId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8"));
    const resigned = { ...base, status: "revoked", revokedAt: new Date().toISOString(), revocationReason: "" };
    resigned.fingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readEvaluationAccessGrant(root, grant.grantId)).rejects.toThrow("EVALUATION_ACCESS_GRANT_INTEGRITY_FAILED");
  });
});
