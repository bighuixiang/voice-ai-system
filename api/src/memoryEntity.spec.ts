import { describe, expect, it } from "vitest";
import { assertAliasAssertionEventIntegrity, assertMemoryEntityEventIntegrity, confirmAliasAssertion, createAliasAssertion, createMemoryEntityIdentity, listAliasAssertions, listMemoryEntities, mergeMemoryEntities, persistAliasAssertion, persistMemoryEntity, replayMemoryEntityEvents, replayPersistedMemoryEntities, resolveMemoryAlias, splitMemoryEntity } from "./memoryEntity.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

describe("memory entity identity", () => {
  it("keeps same-name entities separate without an alias evidence assertion", () => {
    const first = createMemoryEntityIdentity({ entityId: "character-a", kind: "character", canonicalName: "Lin Xia", sourceRefs: ["chapter://1"] });
    const second = createMemoryEntityIdentity({ entityId: "character-b", kind: "character", canonicalName: "Lin Xia", sourceRefs: ["chapter://2"] });
    expect(resolveMemoryAlias({ entities: [first, second], assertions: [], alias: "White Crow" })).toMatchObject({ status: "unknown", entityIds: [] });
  });

  it("requires evidence before confirming a disguise or alias", () => {
    const proposed = createAliasAssertion({ fromEntityId: "identity-white-crow", alias: "White Crow", relation: "disguise-of", toEntityId: "character-a", evidenceRefs: ["chapter-3#reveal"], knowledgeScope: "author" });
    const confirmed = confirmAliasAssertion(proposed, { confirmer: "author-1" });
    expect(confirmed.status).toBe("confirmed");
  });

  it("rejects a rehashed entity event with an invalid timestamp", () => {
    const entity = createMemoryEntityIdentity({ entityId: "entity-event-shape", kind: "character", canonicalName: "A", sourceRefs: ["chapter://1"] });
    const base = { schemaVersion: "memory-entity-event.v1" as const, eventId: "event-shape", eventType: "created" as const, entity, createdAt: "not-a-date", evidenceRefs: [] as string[] };
    const forged = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
    expect(() => assertMemoryEntityEventIntegrity(forged)).toThrow("MEMORY_ENTITY_EVENT_INTEGRITY_FAILED");
  });

  it("rejects an alias event with an invalid timestamp before persistence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-alias-event-forged-"));
    const assertion = createAliasAssertion({ fromEntityId: "entity-a", alias: "Alias", relation: "alias-of", toEntityId: "entity-b", evidenceRefs: ["chapter://1"], knowledgeScope: "author" });
    await expect(persistAliasAssertion(root, assertion)).resolves.toMatchObject({ created: true });
    const target = path.join(root, "memory", "aliases", "events.jsonl");
    const event = JSON.parse((await fs.readFile(target, "utf8")).trim()) as Record<string, unknown>;
    event.createdAt = "not-a-date";
    const { fingerprint: _fingerprint, ...base } = event;
    event.fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.writeFile(target, `${JSON.stringify(event)}\n`, "utf8");
    expect(() => assertAliasAssertionEventIntegrity(event as never)).toThrow("ALIAS_ASSERTION_EVENT_INTEGRITY_FAILED");
  });

  it("fails closed when persisted entity replay contains malformed JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-entity-replay-forged-"));
    await fs.mkdir(path.join(root, "memory", "entities"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "entities", "events.jsonl"), "{not-json}\n", "utf8");
    await expect(replayPersistedMemoryEntities(root)).rejects.toThrow();
  });

  it("resolves only confirmed aliases and preserves ambiguity", () => {
    const first = createMemoryEntityIdentity({ entityId: "character-a", kind: "character", canonicalName: "A", sourceRefs: ["chapter://1"] });
    const second = createMemoryEntityIdentity({ entityId: "character-b", kind: "character", canonicalName: "B", sourceRefs: ["chapter://2"] });
    const assertion = confirmAliasAssertion(createAliasAssertion({ fromEntityId: "identity-white-crow", alias: "White Crow", relation: "same-as", toEntityId: "character-a", evidenceRefs: ["chapter-3#1"], knowledgeScope: "author" }), { confirmer: "author" });
    expect(resolveMemoryAlias({ entities: [first, second], assertions: [assertion], alias: "White Crow" })).toMatchObject({ status: "resolved", entityIds: ["character-a"] });
  });

  it("persists stable entities and alias assertions as replayable current projections", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-entity-store-"));
    const entity = createMemoryEntityIdentity({ entityId: "character-persisted", kind: "character", canonicalName: "Lin Xia", sourceRefs: ["chapter://1"] });
    const assertion = confirmAliasAssertion(createAliasAssertion({ fromEntityId: "identity-mask", alias: "White Crow", relation: "same-as", toEntityId: entity.entityId, evidenceRefs: ["chapter-3#reveal"], knowledgeScope: "author" }), { confirmer: "author" });
    await persistMemoryEntity(root, entity, "created");
    await persistAliasAssertion(root, assertion, "confirmed");
    expect(await listMemoryEntities(root)).toEqual([expect.objectContaining({ entityId: entity.entityId })]);
    expect(await listAliasAssertions(root)).toEqual([expect.objectContaining({ assertionId: assertion.assertionId, status: "confirmed" })]);
  });

  it("replays merge and split lineage deterministically instead of collapsing identity", async () => {
    const first = createMemoryEntityIdentity({ entityId: "character-a", kind: "character", canonicalName: "A", sourceRefs: ["chapter://1"] });
    const second = createMemoryEntityIdentity({ entityId: "character-b", kind: "character", canonicalName: "B", sourceRefs: ["chapter://2"] });
    const merged = mergeMemoryEntities({ sourceEntities: [first, second], targetEntity: createMemoryEntityIdentity({ entityId: "character-ab", kind: "character", canonicalName: "A-B", sourceRefs: ["chapter://3"] }), confirmer: "author", evidenceRefs: ["chapter-3#reveal"], reason: "identity resolution" });
    const split = splitMemoryEntity({ sourceEntity: merged.entities.find((entity) => entity.entityId === "character-ab")!, replacementEntities: [createMemoryEntityIdentity({ entityId: "character-a2", kind: "character", canonicalName: "A", sourceRefs: ["chapter://4"] }), createMemoryEntityIdentity({ entityId: "character-b2", kind: "character", canonicalName: "B", sourceRefs: ["chapter://4"] })], confirmer: "author", evidenceRefs: ["chapter-4#reveal"], reason: "identity split" });
    const replay = replayMemoryEntityEvents([...merged.events, { schemaVersion: "memory-entity-event.v1", eventId: "created-target", eventType: "created", entity: merged.entities.find((entity) => entity.entityId === "character-ab")!, createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "legacy-fixture" }, ...split.events, ...split.entities.filter((entity) => entity.status === "active").map((entity, index) => ({ schemaVersion: "memory-entity-event.v1" as const, eventId: `created-replacement-${index}`, eventType: "created" as const, entity, createdAt: `2026-07-31T00:00:0${index}.000Z`, fingerprint: "legacy-fixture" }))]);
    expect(replay.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "character-a", status: "merged" }), expect.objectContaining({ entityId: "character-ab", status: "split" }), expect.objectContaining({ entityId: "character-a2", status: "active" })]));
    expect(replay.lineage).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "character-a", relation: "merged-into", relatedEntityId: "character-ab" }), expect.objectContaining({ entityId: "character-ab", relation: "split-into", relatedEntityId: "character-a2" })]));
    expect(replay.fingerprint).toHaveLength(64);
  });

  it("persists lifecycle events and rebuilds the entity projection from the event stream", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-entity-replay-"));
    const first = createMemoryEntityIdentity({ entityId: "entity-a", kind: "object", canonicalName: "A", sourceRefs: ["chapter://1"] });
    const second = createMemoryEntityIdentity({ entityId: "entity-b", kind: "object", canonicalName: "B", sourceRefs: ["chapter://2"] });
    await persistMemoryEntity(root, first);
    await persistMemoryEntity(root, second);
    const merged = mergeMemoryEntities({ sourceEntities: [first, second], targetEntity: createMemoryEntityIdentity({ entityId: "entity-ab", kind: "object", canonicalName: "AB", sourceRefs: ["chapter://3"] }), confirmer: "author", evidenceRefs: ["chapter-3#1"], reason: "merge" });
    await persistMemoryEntity(root, merged.entities[0], "merged", { replacementEntityIds: ["entity-ab"], evidenceRefs: ["chapter-3#1"], reason: "merge" });
    await persistMemoryEntity(root, merged.entities[1], "merged", { replacementEntityIds: ["entity-ab"], evidenceRefs: ["chapter-3#1"], reason: "merge" });
    await persistMemoryEntity(root, merged.entities[2], "created");
    const replay = await replayPersistedMemoryEntities(root);
    expect(replay.entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "entity-a", status: "merged" }), expect.objectContaining({ entityId: "entity-ab", status: "active" })]));
    expect(replay.lineage).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "entity-a", relatedEntityId: "entity-ab", relation: "merged-into" })]));
  });

  it("fails closed when a re-signed entity projection changes its kind", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-entity-tamper-"));
    const entity = createMemoryEntityIdentity({ entityId: "entity-tamper", kind: "object", canonicalName: "Gate", sourceRefs: ["chapter://1"] });
    await persistMemoryEntity(root, entity);
    const target = path.join(root, "memory", "entities", "current.json");
    const current = JSON.parse(await fs.readFile(target, "utf8")) as Array<Record<string, unknown>>;
    const resigned = { ...current[0], kind: "forged" };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify([resigned]), "utf8");
    await expect(listMemoryEntities(root)).rejects.toThrow("MEMORY_ENTITY_INTEGRITY_FAILED");
  });
});
