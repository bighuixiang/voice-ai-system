import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEmergenceCandidate, adoptEmergenceCandidate, readEmergenceCandidate } from "./emergenceCandidate.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "emergence-")); }
const input = (root: string, level: "L0" | "L1" | "L2" = "L1") => ({ root, projectSlug: "demo", chapterId: "chapter-001", observation: "正文中人物主动隐瞒信息", emergenceType: "character-motivation" as const, level, competingInterpretations: ["出于保护", "出于自利"], affectedNodeIds: ["character-hero"], sourceRefs: ["prose://chapter-001#segment-1"] });
describe("emergence candidates", () => {
  it("stores non-canon observation and impact report", async () => { const candidate = await createEmergenceCandidate(input(await root(), "L2")); expect(candidate.status).toBe("candidate"); expect(candidate.canonWritten).toBe(false); expect(candidate.impactReport.affectedNodeIds).toEqual(["character-hero"]); expect(candidate.impactReport.changeLevel).toBe("L2"); });
  it("blocks silent L2 adoption and allows authorized reversible L0 adoption", async () => { const r = await root(); const l2 = await createEmergenceCandidate(input(r, "L2")); await expect(adoptEmergenceCandidate(r, l2.candidateId, { authorization: "none", regressionFingerprint: "reg-1" })).rejects.toThrow("EMERGENCE_CONFIRMATION_REQUIRED"); const l0 = await createEmergenceCandidate(input(r, "L0")); const adopted = await adoptEmergenceCandidate(r, l0.candidateId, { authorization: "author", regressionFingerprint: "reg-1" }); expect(adopted.status).toBe("adopted"); expect(adopted.canonWritten).toBe(false); });
  it("is idempotent and requires competing interpretations and evidence", async () => { const r = await root(); const one = await createEmergenceCandidate(input(r)); const two = await createEmergenceCandidate(input(r)); expect(two.fingerprint).toBe(one.fingerprint); await expect(createEmergenceCandidate({ ...input(r), competingInterpretations: ["only"] })).rejects.toThrow("EMERGENCE_COMPETING_INTERPRETATIONS_REQUIRED"); await expect(createEmergenceCandidate({ ...input(r), sourceRefs: [] })).rejects.toThrow("EMERGENCE_SOURCE_REQUIRED"); expect(await readEmergenceCandidate(r, one.candidateId)).toEqual(one); });

  it("requires structure validation and rollback evidence before L1 adoption", async () => {
    const r = await root();
    const candidate = await createEmergenceCandidate(input(r, "L1"));
    await expect(adoptEmergenceCandidate(r, candidate.candidateId, { authorization: "author", regressionFingerprint: "reg-1" })).rejects.toThrow("EMERGENCE_STRUCTURE_VALIDATION_REQUIRED");
    await expect(adoptEmergenceCandidate(r, candidate.candidateId, { authorization: "author", regressionFingerprint: "reg-1", structureValidationFingerprint: "validation-1" })).rejects.toThrow("EMERGENCE_ROLLBACK_REQUIRED");
    const adopted = await adoptEmergenceCandidate(r, candidate.candidateId, { authorization: "author", regressionFingerprint: "reg-1", structureValidationFingerprint: "validation-1", rollbackPoint: "rollback-1" });
    expect(adopted.status).toBe("adopted");
  });

  it("keeps protected impact blocked even when an author is present", async () => {
    const r = await root();
    const candidate = await createEmergenceCandidate({ ...input(r, "L1"), protectedNodeIds: ["character-hero"] });
    await expect(adoptEmergenceCandidate(r, candidate.candidateId, { authorization: "author", regressionFingerprint: "reg-1", structureValidationFingerprint: "validation-1", rollbackPoint: "rollback-1" })).rejects.toThrow("EMERGENCE_PROTECTED_IMPACT_BLOCKED");
  });

  it("fails closed when a candidate is tampered", async () => {
    const r = await root();
    const candidate = await createEmergenceCandidate(input(r));
    const target = path.join(r, "sessions", "emergence-candidates", `${candidate.candidateId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    await fs.writeFile(target, JSON.stringify({ ...persisted, canonWritten: true }), "utf8");
    await expect(readEmergenceCandidate(r, candidate.candidateId)).rejects.toThrow("EMERGENCE_CANDIDATE_INTEGRITY_FAILED");
  });
});
