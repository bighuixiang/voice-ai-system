import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditObligationPublication, persistObligationPublication, readObligationPublication } from "./obligationPublicationArchive.js";
import { freezeObligationPublication } from "./obligationPublication.js";

describe("obligation publication archive", () => {
  it("keeps V1 immutable while V2 can fail its own audit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-publication-archive-"));
    const v1 = freezeObligationPublication({ publicationId: "book-1", version: "v1", obligations: [{ obligationId: "obl-1", status: "paid", evidenceFingerprint: "e1" }] });
    const v2 = freezeObligationPublication({ publicationId: "book-1", version: "v2", obligations: [{ obligationId: "obl-1", status: "evidence_invalidated", evidenceFingerprint: "" }] });
    await persistObligationPublication(root, v1); await persistObligationPublication(root, v2);
    expect(auditObligationPublication(v1)).toMatchObject({ status: "passed", blockers: [] });
    expect(auditObligationPublication(v2)).toMatchObject({ status: "blocked", blockers: ["obl-1"] });
    expect(await readObligationPublication(root, "book-1", "v1")).toMatchObject({ version: "v1", auditView: { obligations: [{ status: "paid", evidenceFingerprint: "e1" }] } });
  });
});
