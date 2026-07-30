import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileOutlineCandidate, readOutlineCandidate } from "./outlineCandidate.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-candidate-")); roots.push(root);
  await fs.mkdir(path.join(root, "sessions", "contract-candidates"), { recursive: true });
  const base = {
    schemaVersion: "story-contract-candidate.v1", candidateId: "contract-candidate-demo", projectSlug: "demo", status: "candidate",
    sourceDecisionId: "decision-1", sourceFingerprint: "decision-fingerprint", fields: [],
    contract: {
      protagonist: { primaryDesire: "open the sealed gate", innerNeed: null, misbelief: null },
      conflict: { core: "The gate demands a sacrifice.", opposingPressure: null },
      stakes: { failureCost: "The valley loses its memory.", irreversibleChoice: null },
      world: { primaryRule: "Only a named witness can open it." }, readerPromise: null, endingDirection: "Truth costs the protagonist their old identity."
    }, assumptions: [], impactSummary: [], unknowns: ["POV"], canonWritten: false, createdAt: new Date().toISOString()
  };
  const fingerprint = "candidate-fingerprint";
  await fs.writeFile(path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json"), JSON.stringify({ ...base, fingerprint }), "utf8");
  return root;
}

describe("outline candidate compiler", () => {
  it("compiles a comparable causal horizon without writing canon", async () => {
    const root = await fixture();
    const result = await compileOutlineCandidate(root, "contract-candidate-demo");
    expect(result.created).toBe(true);
    expect(result.outline).toMatchObject({ schemaVersion: "outline-candidate.v1", status: "candidate", canonWritten: false, horizon: { strongFreezeCount: 3, totalChapterCount: 5 } });
    expect(result.outline.chapters).toHaveLength(5);
    expect(result.outline.chapters.slice(0, 3).every((chapter) => chapter.freeze === "strong")).toBe(true);
    expect(result.outline.chapters.slice(3).every((chapter) => chapter.freeze === "tentative")).toBe(true);
    expect(result.outline.chapters.every((chapter) => chapter.causalInputs.length > 0 && chapter.causalOutputs.length > 0)).toBe(true);
    expect(await readOutlineCandidate(root, result.outline.outlineId)).toEqual(result.outline);
  });

  it("is idempotent and rejects stale source candidates", async () => {
    const root = await fixture();
    const first = await compileOutlineCandidate(root, "contract-candidate-demo");
    const second = await compileOutlineCandidate(root, "contract-candidate-demo");
    expect(second.created).toBe(false);
    expect(second.outline).toEqual(first.outline);
    const candidatePath = path.join(root, "sessions", "contract-candidates", "contract-candidate-demo.json");
    const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
    await fs.writeFile(candidatePath, JSON.stringify({ ...candidate, status: "stale" }), "utf8");
    await expect(compileOutlineCandidate(root, "contract-candidate-demo-2")).rejects.toThrow("CONTRACT_CANDIDATE_NOT_FOUND");
    await expect(compileOutlineCandidate(root, "contract-candidate-demo")).rejects.toThrow("CONTRACT_CANDIDATE_STALE");
  });
});
