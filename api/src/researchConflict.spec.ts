import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createResearchConflictCase, persistResearchConflictCase, readResearchConflictCase, resolveResearchConflictCase } from "./researchConflict.js";

describe("research conflict adjudication", () => {
  it("requires multiple distinct parties and traceable evidence", () => {
    expect(() => createResearchConflictCase({ conflictId: "conf-1", claimIds: ["claim-1"], sourceIds: ["source-1", "source-2"], conflictKind: "direct", evidenceRefs: ["audit://conf-1"] })).toThrow("RESEARCH_CONFLICT_PARTIES_REQUIRED");
    expect(() => createResearchConflictCase({ conflictId: "conf-1", claimIds: ["claim-1", "claim-2"], sourceIds: ["source-1", "source-2"], conflictKind: "direct", evidenceRefs: ["not-a-ref"] })).toThrow("RESEARCH_CONFLICT_EVIDENCE_REQUIRED");
  });

  it("resolves only to a participating claim or an explicitly evidenced waiver", () => {
    const conflict = createResearchConflictCase({ conflictId: "conf-2", claimIds: ["claim-1", "claim-2"], sourceIds: ["source-1", "source-2"], conflictKind: "temporal", evidenceRefs: ["source://conf-2"] });
    expect(() => resolveResearchConflictCase(conflict, { status: "resolved", selectedClaimId: "claim-3", rationale: "choose", evidenceRefs: ["audit://resolution"] })).toThrow("RESEARCH_CONFLICT_SELECTED_CLAIM_REQUIRED");
    const resolved = resolveResearchConflictCase(conflict, { status: "resolved", selectedClaimId: "claim-2", rationale: "newer source applies to the target date", evidenceRefs: ["audit://resolution"] });
    expect(resolved).toMatchObject({ status: "resolved", selectedClaimId: "claim-2", evidenceRefs: ["source://conf-2", "audit://resolution"] });
    expect(() => resolveResearchConflictCase(resolved, { status: "waived", rationale: "not material", evidenceRefs: ["audit://waiver"] })).toThrow("RESEARCH_CONFLICT_NOT_OPEN");
  });

  it("persists conflict decisions idempotently and preserves immutable history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "research-conflict-"));
    const conflict = createResearchConflictCase({ conflictId: "conf-3", claimIds: ["claim-1", "claim-2"], sourceIds: ["source-1", "source-2"], conflictKind: "regional", evidenceRefs: ["audit://conf-3"] });
    expect((await persistResearchConflictCase(root, conflict)).created).toBe(true);
    expect((await persistResearchConflictCase(root, conflict)).created).toBe(false);
    expect(await readResearchConflictCase(root, "conf-3")).toEqual(conflict);
    const resolved = resolveResearchConflictCase(conflict, { status: "waived", rationale: "author accepts fictionalized uncertainty", evidenceRefs: ["decision://author/1"] });
    await expect(persistResearchConflictCase(root, resolved)).rejects.toThrow("RESEARCH_CONFLICT_IMMUTABLE");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("fails closed when a re-signed conflict selects a non-participating claim", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "research-conflict-tamper-"));
    const conflict = createResearchConflictCase({ conflictId: "conf-tamper", claimIds: ["claim-1", "claim-2"], sourceIds: ["source-1", "source-2"], conflictKind: "direct", evidenceRefs: ["audit://conf-tamper"] });
    await persistResearchConflictCase(root, conflict);
    const target = path.join(root, "research", "conflicts", "conf-tamper.json");
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const resigned = { ...base, status: "resolved", selectedClaimId: "claim-forged", rationale: "forged decision", resolvedAt: new Date().toISOString() };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readResearchConflictCase(root, conflict.conflictId)).rejects.toThrow("RESEARCH_CONFLICT_INTEGRITY_FAILED");
  });
});
