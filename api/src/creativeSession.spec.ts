import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSessionMessage, appendAuthorMessage, readCreativeSession, updateCreativeSessionState } from "./creativeSession.js";

const roots: string[] = [];
async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "creative-session-"));
  roots.push(root);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("creative session RP1 state and provenance", () => {
  it("persists the collaboration state required for refresh and restart", async () => {
    const root = await makeRoot();
    const initial = await readCreativeSession(root, "p1");
    const result = await updateCreativeSessionState({
      root, projectSlug: "p1", expectedFingerprint: initial.fingerprint,
      phase: "understanding", collaborationMode: "guided", activeQuestionId: "q-1",
      latestDirection: "keep the opening intimate", unconfirmedAssumptions: ["the bell is unexplained"],
      decisionRefs: ["decision-1"], pendingPatchRefs: ["patch-1"]
    });
    expect(result.session.phase).toBe("understanding");
    expect(result.session.latestDirection).toBe("keep the opening intimate");
    expect(result.session.decisionRefs).toEqual(["decision-1"]);
    expect((await readCreativeSession(root, "p1")).fingerprint).toBe(result.session.fingerprint);
  });

  it("keeps author, system paraphrase, inference, and task result distinguishable", async () => {
    const root = await makeRoot();
    await appendAuthorMessage({ root, projectSlug: "p1", clientMessageId: "m-1", text: "A bell rings" });
    await appendSessionMessage({ root, projectSlug: "p1", clientMessageId: "m-2", kind: "system-paraphrase", text: "You want an unsettling opening." });
    await appendSessionMessage({ root, projectSlug: "p1", clientMessageId: "m-3", kind: "system-inference", text: "The bell may signal a hidden threat." });
    await appendSessionMessage({ root, projectSlug: "p1", clientMessageId: "m-4", kind: "task-result", text: "Understanding preview is ready." });
    const session = await readCreativeSession(root, "p1");
    expect(session.messages.map((message) => message.source.kind)).toEqual(["author", "system-paraphrase", "system-inference", "task-result"]);
  });

  it("rejects a stale state writer instead of overwriting newer session state", async () => {
    const root = await makeRoot();
    const initial = await readCreativeSession(root, "p1");
    await updateCreativeSessionState({ root, projectSlug: "p1", expectedFingerprint: initial.fingerprint, phase: "understanding", collaborationMode: "guided", activeQuestionId: "q-1", latestDirection: "first", unconfirmedAssumptions: [], decisionRefs: [], pendingPatchRefs: [] });
    await expect(updateCreativeSessionState({ root, projectSlug: "p1", expectedFingerprint: initial.fingerprint, phase: "capture", collaborationMode: "guided", activeQuestionId: undefined, latestDirection: "stale", unconfirmedAssumptions: [], decisionRefs: [], pendingPatchRefs: [] })).rejects.toThrow("CREATIVE_SESSION_VERSION_CONFLICT");
  });

  it("fails closed when a persisted session fingerprint no longer matches", async () => {
    const root = await makeRoot();
    await appendAuthorMessage({ root, projectSlug: "p1", clientMessageId: "m-1", text: "A bell rings" });
    const sessionPath = path.join(root, "sessions", "creative-session.json");
    const persisted = JSON.parse(await fs.readFile(sessionPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(sessionPath, JSON.stringify({ ...persisted, latestDirection: "tampered" }), "utf8");
    await expect(readCreativeSession(root, "p1")).rejects.toThrow("CREATIVE_SESSION_INTEGRITY_FAILED");
  });
});
