import { describe, expect, it } from "vitest";
import { evaluateContextPrivacy } from "./contextPrivacyGate.js";

describe("context privacy gate", () => {
  it("passes authorized project-scoped untrusted content as data", () => {
    const result = evaluateContextPrivacy({ projectSlug: "p1", purpose: "understanding", sources: [{ sourceId: "s-1", projectSlug: "p1", content: "The author wants a storm.", dataClass: "author-text", rights: "project-authorized", providerAuthorized: true, deleted: false }] });
    expect(result).toMatchObject({ status: "pass", includedSourceIds: ["s-1"] });
  });

  it("blocks secrets, cross-project sources and unauthorized/deleted material", () => {
    const result = evaluateContextPrivacy({ projectSlug: "p1", purpose: "understanding", sources: [
      { sourceId: "secret", projectSlug: "p1", content: "token=sk-test-123", dataClass: "project-file", rights: "project-authorized", providerAuthorized: true, deleted: false },
      { sourceId: "cross", projectSlug: "p2", content: "private", dataClass: "imported", rights: "project-authorized", providerAuthorized: true, deleted: false },
      { sourceId: "deleted", projectSlug: "p1", content: "old", dataClass: "retrieval", rights: "project-authorized", providerAuthorized: true, deleted: true }
    ] });
    expect(result).toMatchObject({ status: "block", includedSourceIds: [], blockedSourceIds: ["secret", "cross", "deleted"] });
    expect(result.reasons).toEqual(expect.arrayContaining(["SECRET_DETECTED", "PROJECT_SCOPE_VIOLATION", "SOURCE_DELETED"]));
  });

  it("blocks blank or untyped source metadata", () => {
    const result = evaluateContextPrivacy({ projectSlug: "p1", purpose: "understanding", sources: [{ sourceId: "", projectSlug: "p1", content: "data", dataClass: "author-text", rights: "project-authorized", providerAuthorized: true, deleted: false }] });
    expect(result).toMatchObject({ status: "block", reasons: ["SOURCE_METADATA_INVALID"] });
  });
});
