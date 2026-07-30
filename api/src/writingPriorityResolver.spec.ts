import { describe, expect, it } from "vitest";
import { resolveWritingPriority } from "./writingPriorityResolver.js";

const valid = { requestId: "req-1", layers: { lockedCanon: [{ key: "opening", value: "quiet aftermath", source: "canon" }], authorDirection: [{ key: "opening", value: "quiet aftermath", source: "author" }], povCharacter: [{ key: "voice", value: "guarded", source: "character" }], sceneFunction: [{ key: "goal", value: "mourn", source: "scene" }], projectPreference: [{ key: "length", value: "short", source: "project" }], craftPattern: [{ key: "opening", value: "pressure", source: "pattern" }], genreProfile: [{ key: "tone", value: "dark", source: "genre" }], platformDefault: [{ key: "hook", value: "cliffhanger", source: "platform" }] }, sceneMode: "aftermath", evidenceRefs: ["context://req-1"] };

describe("writing priority resolver", () => {
  it("lets high-priority locked canon and author direction override lower layers", () => {
    const result = resolveWritingPriority(valid);
    expect(result.status).toBe("resolved");
    expect(result.resolved.find((item) => item.key === "opening")?.value).toBe("quiet aftermath");
  });

  it("surfaces irreconcilable conflicts with minimal questions", () => {
    const result = resolveWritingPriority({ ...valid, layers: { ...valid.layers, lockedCanon: [{ key: "ending", value: "dies", source: "canon" }], authorDirection: [{ key: "ending", value: "survives", source: "author" }] } });
    expect(result.status).toBe("blocked");
    expect(result.conflicts[0]?.minimalQuestion).toContain("ending");
  });

  it("does not force generic pressure patterns onto aftermath scenes", () => {
    const result = resolveWritingPriority(valid);
    expect(result.resolved.some((item) => item.key === "opening" && item.value === "pressure")).toBe(false);
  });
});
