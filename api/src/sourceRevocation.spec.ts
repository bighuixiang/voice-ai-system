import { describe, expect, it } from "vitest";
import { createSourceLineage, revokeSourceLineage } from "./sourceRevocation.js";

const base = { sourceId: "source-1", projectSlug: "demo", accessClass: "private" as const, derivedPatternIds: ["pattern-1"], sourceRefs: ["source://1"] };
describe("source isolation and revocation", () => {
  it("keeps private lineage project-scoped and propagates full forget", () => { const lineage = createSourceLineage(base); const result = revokeSourceLineage(lineage, { mode: "delete-source-and-derivatives", actor: "author", reason: "forget", evidenceRefs: ["decision://forget"] }); expect(result.status).toBe("forgotten"); expect(result.sourceSearchable).toBe(false); expect(result.derivedPatternStates).toEqual([{ patternId: "pattern-1", status: "retired" }]); });
  it("supports source-only deletion and public revalidation/retirement", () => { const privateLineage = createSourceLineage(base); const sourceOnly = revokeSourceLineage(privateLineage, { mode: "delete-source-only", actor: "author", reason: "remove original", evidenceRefs: ["decision://remove"] }); expect(sourceOnly.derivedPatternStates[0].status).toBe("needs-revalidation"); const publicLineage = createSourceLineage({ ...base, sourceId: "public-1", accessClass: "public" }); const pub = revokeSourceLineage(publicLineage, { mode: "platform-policy", actor: "platform", reason: "source withdrawn", evidenceRefs: ["platform://policy"] }); expect(pub.derivedPatternStates[0].status).toBe("retired"); });
  it("requires authorization and evidence", () => { expect(() => revokeSourceLineage(createSourceLineage(base), { mode: "delete-source-only", actor: "", reason: "x", evidenceRefs: [] })).toThrow("SOURCE_REVOCATION_AUTH_REQUIRED"); });
});
