import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSourceMaterial, createRightsEnvelope, readRightsEnvelope, readSourceMaterial } from "./sourceRights.js";
import crypto from "node:crypto";

async function rootFixture() { return fs.mkdtemp(path.join(os.tmpdir(), "source-rights-")); }

describe("source material rights boundary", () => {
  it("records provenance and permits only declared uses", async () => {
    const root = await rootFixture();
    const source = await createSourceMaterial({ root, projectSlug: "demo", title: "Author reference", type: "sample", provenance: "author-upload", rightsStatus: "owned", licensor: "author-1", allowedUses: ["analysis", "style-experiment"], projectScope: "demo", retainExcerpt: false, importedBy: "author-1" });
    expect(source.rightsStatus).toBe("owned");
    expect(source.allowedUses).toEqual(["analysis", "style-experiment"]);
    expect(await readSourceMaterial(root, source.sourceId)).toEqual(source);
  });

  it("turns unknown rights into analysis-only and never allows generation", async () => {
    const root = await rootFixture();
    const source = await createSourceMaterial({ root, projectSlug: "demo", title: "Unknown web excerpt", type: "web", provenance: "import", rightsStatus: "unknown", licensor: "", allowedUses: ["analysis", "generation"], projectScope: "demo", retainExcerpt: true, importedBy: "system" });
    const envelope = await createRightsEnvelope({ root, source, checkedBy: "system" });
    expect(envelope.status).toBe("restricted");
    expect(envelope.analysisOnly).toBe(true);
    expect(envelope.allowedUses).toEqual(["analysis"]);
    const expiredSource = await createSourceMaterial({ root, projectSlug: "demo", title: "Expired licensed excerpt", type: "web", provenance: "import", rightsStatus: "licensed", licensor: "publisher", allowedUses: ["analysis"], projectScope: "demo", retainExcerpt: false, importedBy: "system", licenseExpiresAt: "2020-01-01T00:00:00.000Z" });
    await expect(createRightsEnvelope({ root, source: expiredSource, checkedBy: "system" })).resolves.toMatchObject({ status: "expired", analysisOnly: true });
  });

  it("is idempotent for the same source and rights snapshot", async () => {
    const root = await rootFixture();
    const input = { root, projectSlug: "demo", title: "Owned notes", type: "notes" as const, provenance: "author-upload", rightsStatus: "owned" as const, licensor: "author-1", allowedUses: ["analysis"] as const, projectScope: "demo", retainExcerpt: false, importedBy: "author-1" };
    const first = await createSourceMaterial(input);
    expect(await createSourceMaterial(input)).toEqual(first);
    const envelope = await createRightsEnvelope({ root, source: first, checkedBy: "author-1" });
    expect(await readRightsEnvelope(root, envelope.envelopeId)).toEqual(envelope);
  });
  it("rejects invalid use declarations/license dates and fails closed on tampered rights records", async () => {
    const root = await rootFixture();
    await expect(createSourceMaterial({ root, projectSlug: "demo", title: "bad use", type: "web", provenance: "import", rightsStatus: "owned", licensor: "x", allowedUses: ["not-a-use" as any], projectScope: "demo", retainExcerpt: false, importedBy: "system" })).rejects.toThrow("SOURCE_ALLOWED_USE_INVALID");
    await expect(createSourceMaterial({ root, projectSlug: "demo", title: "bad date", type: "web", provenance: "import", rightsStatus: "licensed", licensor: "x", licenseExpiresAt: "not-a-date", allowedUses: ["analysis"], projectScope: "demo", retainExcerpt: false, importedBy: "system" })).rejects.toThrow("SOURCE_LICENSE_DATE_INVALID");
    const source = await createSourceMaterial({ root, projectSlug: "demo", title: "tamper", type: "notes", provenance: "author", rightsStatus: "owned", licensor: "x", allowedUses: ["analysis"], projectScope: "demo", retainExcerpt: false, importedBy: "system" });
    const sourcePath = path.join(root, "sessions", "source-material", `${source.sourceId}.json`);
    await fs.writeFile(sourcePath, JSON.stringify({ ...source, title: "changed" }), "utf8");
    await expect(readSourceMaterial(root, source.sourceId)).rejects.toThrow("SOURCE_RIGHTS_INTEGRITY_FAILED");
  });

  it("fails closed when a re-signed envelope claims generation for restricted material", async () => {
    const root = await rootFixture();
    const source = await createSourceMaterial({ root, projectSlug: "demo", title: "restricted", type: "web", provenance: "import", rightsStatus: "unknown", licensor: "", allowedUses: ["analysis", "generation"], projectScope: "demo", retainExcerpt: true, importedBy: "system" });
    const envelope = await createRightsEnvelope({ root, source, checkedBy: "system" });
    const target = path.join(root, "sessions", "rights-envelopes", `${envelope.envelopeId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const resigned = { ...base, analysisOnly: false, allowedUses: ["generation"] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readRightsEnvelope(root, envelope.envelopeId)).rejects.toThrow("RIGHTS_ENVELOPE_INTEGRITY_FAILED");
  });
});
