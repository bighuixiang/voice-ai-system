import { describe, expect, it } from "vitest";
import { buildMemoryContradictionSets, createMemoryClaim, createMemoryClaimRelation, evaluateMemoryClaimTemporal, listMemoryClaimRelations, listMemoryClaims, persistMemoryClaim, persistMemoryClaimRelation, persistMemoryClaimRelationRevocation, retconMemoryClaim, settleMemoryClaim } from "./memoryClaim.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

describe("memory claim authority", () => {
  it("requires at least one evidence anchor for every claim", () => {
    expect(() => createMemoryClaim({ claimId: "claim-no-evidence", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: [], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.8 })).toThrow("MEMORY_CLAIM_EVIDENCE_REQUIRED");
  });

  it("rejects a second created event that reuses a claimId for different content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-claim-id-conflict-"));
    const first = createMemoryClaim({ claimId: "claim-stable-id", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    const second = createMemoryClaim({ claimId: "claim-stable-id", proposition: "The gate is sealed", epistemicType: "canon_fact", sourceRefs: ["chapter://2"], evidenceAnchors: ["chapter-2#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    await persistMemoryClaim(root, first, "created", "first");
    await expect(persistMemoryClaim(root, second, "created", "different proposition")).rejects.toThrow("MEMORY_CLAIM_ID_CONFLICT");
  });

  it("keeps un-settled claims out of canon eligibility", () => {
    const claim = createMemoryClaim({ claimId: "claim-1", proposition: "The gate requires blood", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#span-1"], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.9 });
    expect(claim.status).toBe("candidate");
    expect(claim.sourceVersions).toEqual(["chapter-1:v1"]);
    expect(() => settleMemoryClaim({ claim, chapterSettlementCompleted: false, confirmer: "author", reason: "confirmed" })).toThrow("MEMORY_CLAIM_CHAPTER_SETTLEMENT_REQUIRED");
  });

  it("settles only sourced, evidenced eligible claims and writes an append-only event", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-claim-"));
    const claim = createMemoryClaim({ claimId: "claim-2", proposition: "The gate requires blood", epistemicType: "canon_fact", sourceRefs: ["chapter-settlement://chapter-1"], evidenceAnchors: ["chapter-1#span-1"], producedBy: "author", temporalScope: { asOfVersion: "chapter-1:v1" }, confidence: 0.9 });
    const settled = settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "Author confirmed after settlement" });
    expect(settled).toMatchObject({ status: "eligible", version: 2, producedBy: "chapter-settlement" });
    await persistMemoryClaim(root, claim, "created", "candidate created");
    await persistMemoryClaim(root, settled, "settled", "author confirmed");
    const events = (await fs.readFile(path.join(root, "memory", "claims", "events.jsonl"), "utf8")).trim().split(/\r?\n/);
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[1])).toMatchObject({ eventType: "settled", claim: { status: "eligible" } });
    expect(await listMemoryClaims(root)).toEqual([expect.objectContaining({ claimId: "claim-2", status: "eligible" })]);
  });

  it("keeps multiple claim IDs in the current authority projection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-claims-"));
    for (const claimId of ["claim-a", "claim-b"]) {
      const claim = createMemoryClaim({ claimId, proposition: claimId, epistemicType: "canon_fact", sourceRefs: [`chapter://${claimId}`], evidenceAnchors: [`${claimId}#1`], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
      await persistMemoryClaim(root, claim, "created", "candidate");
    }
    expect((await listMemoryClaims(root)).map((claim) => claim.claimId).sort()).toEqual(["claim-a", "claim-b"]);
  });

  it("does not promote plans or character beliefs into canon eligible claims", () => {
    for (const epistemicType of ["plan", "character_belief"] as const) {
      const claim = createMemoryClaim({ claimId: `claim-${epistemicType}`, proposition: "A future event", epistemicType, sourceRefs: ["outline://candidate"], evidenceAnchors: ["outline#1"], producedBy: "author", temporalScope: { asOfVersion: "outline:v1" }, confidence: 0.8 });
      expect(() => settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "confirm" })).toThrow("MEMORY_CLAIM_EPISTEMIC_TYPE_NOT_CANON_ELIGIBLE");
    }
  });
  it("does not re-promote obsolete epistemic claims", () => {
    const claim = createMemoryClaim({ claimId: "claim-obsolete", proposition: "The gate was open", epistemicType: "obsolete", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    expect(() => settleMemoryClaim({ claim, chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" })).toThrow("MEMORY_CLAIM_EPISTEMIC_TYPE_NOT_CANON_ELIGIBLE");
  });

  it("does not use a claim outside its story-time validity window", () => {
    const claim = createMemoryClaim({ claimId: "claim-time", proposition: "The bridge is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { startEvent: "event-open", endEvent: "event-collapse", asOfVersion: "v1" }, confidence: 0.9 });
    const eventOrder = { "event-before": 1, "event-open": 2, "event-collapse": 3, "event-after": 4 };
    expect(evaluateMemoryClaimTemporal({ claim, targetEvent: "event-before", eventOrder }).status).toBe("not-yet-active");
    expect(evaluateMemoryClaimTemporal({ claim, targetEvent: "event-open", eventOrder }).status).toBe("active");
    expect(evaluateMemoryClaimTemporal({ claim, targetEvent: "event-after", eventOrder }).status).toBe("expired");
  });

  it("retains explicit contradictory claims as a contradiction set", () => {
    const left = createMemoryClaim({ claimId: "claim-left", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    const right = createMemoryClaim({ claimId: "claim-right", proposition: "The gate is sealed", epistemicType: "character_belief", sourceRefs: ["chapter://2"], evidenceAnchors: ["chapter-2#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.7 });
    const relation = createMemoryClaimRelation({ fromClaimId: left.claimId, toClaimId: right.claimId, relation: "contradicts", sourceRefs: ["chapter-2#1"], validFromVersion: "v1" });
    expect(buildMemoryContradictionSets([left, right], [relation])).toEqual([expect.objectContaining({ claimIds: ["claim-left", "claim-right"], relationIds: [relation.relationId] })]);
    expect(relation.createdAt).toMatch(/T/);
  });

  it("requires an applicability version when creating a new relation", () => {
    expect(() => createMemoryClaimRelation({ fromClaimId: "left", toClaimId: "right", relation: "supports", sourceRefs: ["chapter://1"], validFromVersion: "" })).toThrow("MEMORY_CLAIM_RELATION_VERSION_REQUIRED");
  });

  it("persists claim relations and replays contradiction sets from the authority log", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-relations-"));
    const left = createMemoryClaim({ claimId: "claim-persist-left", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    const right = createMemoryClaim({ claimId: "claim-persist-right", proposition: "The gate is sealed", epistemicType: "canon_fact", sourceRefs: ["chapter://2"], evidenceAnchors: ["chapter-2#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    await persistMemoryClaim(root, left, "created", "left");
    await persistMemoryClaim(root, right, "created", "right");
    const relation = createMemoryClaimRelation({ fromClaimId: left.claimId, toClaimId: right.claimId, relation: "contradicts", sourceRefs: ["chapter-2#1"], validFromVersion: "v1" });
    await persistMemoryClaimRelation(root, relation);
    expect(await listMemoryClaimRelations(root)).toEqual([relation]);
    expect(buildMemoryContradictionSets(await listMemoryClaims(root), await listMemoryClaimRelations(root))).toEqual([expect.objectContaining({ claimIds: [left.claimId, right.claimId], relationIds: [relation.relationId] })]);
  });

  it("persists relation revocation events and removes revoked contradictions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-relation-revoke-"));
    const left = createMemoryClaim({ claimId: "claim-revoke-left", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    const right = createMemoryClaim({ claimId: "claim-revoke-right", proposition: "The gate is sealed", epistemicType: "canon_fact", sourceRefs: ["chapter://2"], evidenceAnchors: ["chapter-2#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    await persistMemoryClaim(root, left, "created", "left");
    await persistMemoryClaim(root, right, "created", "right");
    const relation = createMemoryClaimRelation({ fromClaimId: left.claimId, toClaimId: right.claimId, relation: "contradicts", sourceRefs: ["chapter://2"], validFromVersion: "v1" });
    await persistMemoryClaimRelation(root, relation);
    await persistMemoryClaimRelationRevocation(root, { relationId: relation.relationId, reason: "canon revision", sourceRefs: ["chapter://3"] });
    const replayed = await listMemoryClaimRelations(root);
    expect(replayed[0].revokedAt).toMatch(/T/);
    expect(buildMemoryContradictionSets(await listMemoryClaims(root), replayed)).toEqual([]);
  });

  it("fails closed when a persisted relation is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-relations-tamper-"));
    const relation = createMemoryClaimRelation({ fromClaimId: "left", toClaimId: "right", relation: "contradicts", sourceRefs: ["chapter://2"], validFromVersion: "v1" });
    await persistMemoryClaimRelation(root, relation);
    await fs.writeFile(path.join(root, "memory", "claims", "relations.jsonl"), JSON.stringify({ ...relation, relation: "supports" }) + "\n", "utf8");
    await expect(listMemoryClaimRelations(root)).rejects.toThrow("MEMORY_CLAIM_RELATION_INTEGRITY_FAILED");
  });

  it("creates a versioned retcon and prevents the obsolete claim from passing canon eligibility", () => {
    const original = settleMemoryClaim({
      claim: createMemoryClaim({ claimId: "claim-retcon", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }),
      chapterSettlementCompleted: true,
      confirmer: "author-1",
      reason: "settled"
    });
    const result = retconMemoryClaim({ claim: original, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "Chapter two reveals the earlier reading was wrong" });
    expect(result.obsolete).toMatchObject({ claimId: "claim-retcon", status: "obsolete", version: 2 });
    expect(result.replacement).toMatchObject({ claimId: "claim-retcon", status: "candidate", version: 3, parentVersion: 2, proposition: "The gate is sealed" });
  });

  it("preserves retcon history while replacing the current projection with the candidate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-retcon-"));
    const original = settleMemoryClaim({ claim: createMemoryClaim({ claimId: "claim-retcon-store", proposition: "The gate is open", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.9 }), chapterSettlementCompleted: true, confirmer: "author-1", reason: "settled" });
    const result = retconMemoryClaim({ claim: original, replacementProposition: "The gate is sealed", replacementEvidenceAnchors: ["chapter-2#9"], confirmer: "author-1", reason: "retcon" });
    await persistMemoryClaim(root, original, "settled", "original");
    await persistMemoryClaim(root, result.obsolete, "obsoleted", "retcon");
    await persistMemoryClaim(root, result.replacement, "created", "replacement candidate");
    expect(await listMemoryClaims(root)).toEqual([expect.objectContaining({ claimId: "claim-retcon-store", status: "candidate", version: 3 })]);
    expect((await fs.readFile(path.join(root, "memory", "claims", "events.jsonl"), "utf8")).trim().split(/\r?\n/)).toHaveLength(3);
  });

  it("fails closed when a re-signed current claim changes its epistemic type", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-claim-tamper-"));
    const claim = createMemoryClaim({ claimId: "claim-tamper", proposition: "The gate requires blood", epistemicType: "canon_fact", sourceRefs: ["chapter://1"], evidenceAnchors: ["chapter-1#1"], producedBy: "author", temporalScope: { asOfVersion: "v1" }, confidence: 0.8 });
    await persistMemoryClaim(root, claim, "created", "candidate");
    const target = path.join(root, "memory", "claims", "current.json");
    const current = JSON.parse(await fs.readFile(target, "utf8")) as Array<Record<string, unknown>>;
    const resigned = { ...current[0], epistemicType: "forged" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify([resigned]), "utf8");
    await expect(listMemoryClaims(root)).rejects.toThrow("MEMORY_CLAIM_INTEGRITY_FAILED");
  });
});
