import { describe, expect, it } from "vitest";
import { attributeManualRevision } from "./manualRevisionAttribution.js";

describe("manual revision attribution", () => {
  it("keeps one scene compression as a mixed hypothesis", () => {
    expect(attributeManualRevision({ revisionId: "r-1", sceneId: "farewell", compressedFrom: "three explanations", repeatedSceneIds: ["farewell"], probeValidated: false })).toMatchObject({ status: "mixed_hypothesis", scope: "scene", promoted: false });
  });
  it("promotes only after three scenes and probe validation", () => {
    expect(attributeManualRevision({ revisionId: "r-2", sceneId: "s3", compressedFrom: "explanations", repeatedSceneIds: ["s1", "s2", "s3"], probeValidated: true })).toMatchObject({ status: "scoped_preference_candidate", scope: "character-line", promoted: true });
  });
});
