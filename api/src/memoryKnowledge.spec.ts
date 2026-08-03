import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertCharacterKnowledgeStateIntegrity, createCharacterKnowledgeState, createReaderKnowledgeState, evaluateCharacterKnowledge, evaluateReaderKnowledge, listCharacterKnowledgeStates, listReaderKnowledgeStates } from "./memoryKnowledge.js";
import { persistCharacterKnowledgeState, persistReaderKnowledgeState } from "./memoryKnowledge.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("memory knowledge boundaries", () => {
  it("does not let a character use a claim before acquisition", () => {
    const state = createCharacterKnowledgeState({ characterId: "c1", claimId: "secret", state: "learned", evidenceRefs: ["chapter-2#tell"], asOfEvent: "e2" });
    expect(evaluateCharacterKnowledge({ states: [state], characterId: "c1", claimId: "secret", targetEvent: "e1", eventOrder: { e1: 1, e2: 2 } }).eligible).toBe(false);
    expect(evaluateCharacterKnowledge({ states: [state], characterId: "c1", claimId: "secret", targetEvent: "e2", eventOrder: { e1: 1, e2: 2 } }).eligible).toBe(true);
  });
  it("keeps reader visibility scoped to publication and progress", () => {
    const state = createReaderKnowledgeState({ readerScope: "default", claimId: "secret", state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-2", evidenceRefs: ["pub-1#chapter-2"] });
    expect(evaluateReaderKnowledge({ states: [state], readerScope: "default", claimId: "secret", publicationVersion: "pub-1", progressCursor: "chapter-1" }).eligible).toBe(false);
    expect(evaluateReaderKnowledge({ states: [state], readerScope: "default", claimId: "secret", publicationVersion: "pub-1", progressCursor: "chapter-2" }).eligible).toBe(true);
    expect(evaluateReaderKnowledge({ states: [state], readerScope: "default", claimId: "secret", publicationVersion: "pub-2", progressCursor: "chapter-2" }).eligible).toBe(false);
  });
  it("orders numeric reader progress naturally instead of lexicographically", () => {
    const state = createReaderKnowledgeState({ readerScope: "default", claimId: "secret", state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-10", evidenceRefs: ["pub-1#chapter-10"] });
    expect(evaluateReaderKnowledge({ states: [state], readerScope: "default", claimId: "secret", publicationVersion: "pub-1", progressCursor: "chapter-2" })).toMatchObject({ eligible: false, reason: "READER_HAS_NOT_SEEN_CLAIM" });
  });
  it("persists append-only knowledge events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-knowledge-store-"));
    const character = createCharacterKnowledgeState({ characterId: "c1", claimId: "secret", state: "learned", evidenceRefs: ["chapter-2#tell"], asOfEvent: "e2" });
    const reader = createReaderKnowledgeState({ readerScope: "default", claimId: "secret", state: "seen", publicationVersion: "pub-1", progressCursor: "chapter-2", evidenceRefs: ["pub-1#chapter-2"] });
    await persistCharacterKnowledgeState(root, character);
    await persistReaderKnowledgeState(root, reader);
    expect((await fs.readFile(path.join(root, "memory/knowledge/character-events.jsonl"), "utf8")).trim()).toContain(character.stateId);
    expect((await fs.readFile(path.join(root, "memory/knowledge/reader-events.jsonl"), "utf8")).trim()).toContain(reader.stateId);
  });
  it("fails closed when append-only knowledge is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-knowledge-store-"));
    const character = createCharacterKnowledgeState({ characterId: "c1", claimId: "secret", state: "learned", evidenceRefs: ["chapter-2#tell"], asOfEvent: "e2" });
    await persistCharacterKnowledgeState(root, character);
    const target = path.join(root, "memory", "knowledge", "character-events.jsonl");
    await fs.writeFile(target, JSON.stringify({ ...character, state: "forgotten" }) + "\n", "utf8");
    await expect(listCharacterKnowledgeStates(root)).rejects.toThrow("CHARACTER_KNOWLEDGE_INTEGRITY_FAILED");
  });

  it("rejects a rehashed character event with an invalid state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-knowledge-forged-"));
    const state = createCharacterKnowledgeState({ characterId: "c1", claimId: "secret", state: "learned", evidenceRefs: ["chapter-2#tell"], asOfEvent: "e2" });
    const { fingerprint: _fingerprint, ...base } = state;
    const forgedBase = { ...base, state: "unknown" as never };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertCharacterKnowledgeStateIntegrity(forged)).toThrow("CHARACTER_KNOWLEDGE_INTEGRITY_FAILED");
    await expect(persistCharacterKnowledgeState(root, forged)).rejects.toThrow("CHARACTER_KNOWLEDGE_INTEGRITY_FAILED");
  });
});
