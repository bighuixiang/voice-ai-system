import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCraftProfile, readCraftProfile } from "./craftProfile.js";

let tempRoot = "";

describe("craftProfile", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "craft-profile-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reads extended voice contract fields from project craft profile", async () => {
    await fs.mkdir(path.join(tempRoot, "bible"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "bible", "craft-profile.json"),
      JSON.stringify(
        {
          version: 1,
          title: "Voice lab",
          principles: ["Concrete pressure first."],
          qualityGates: ["Reject summary-only grandeur."],
          voiceRules: ["Open with pressure and hierarchy."],
          antiPatterns: ["Do not explain aura with praise."],
          sceneContracts: {
            chapterOpening: ["Land omen, pressure, rank, and protagonist position in the first screen."],
            combat: ["Show environmental feedback and visible cost."],
            chapterEnding: ["End on consequence, not explanation."]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const profile = await readCraftProfile(tempRoot);

    expect(profile.title).toBe("Voice lab");
    expect(profile.voiceRules).toEqual(["Open with pressure and hierarchy."]);
    expect(profile.antiPatterns).toEqual(["Do not explain aura with praise."]);
    expect(profile.sceneContracts?.combat).toContain("Show environmental feedback and visible cost.");
  });

  it("falls back to built-in voice defaults when project craft profile omits them", async () => {
    await fs.mkdir(path.join(tempRoot, "bible"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "bible", "craft-profile.json"),
      JSON.stringify(
        {
          version: 1,
          title: "Minimal lab",
          principles: ["Pressure matters."],
          qualityGates: ["Reject filler."]
        },
        null,
        2
      ),
      "utf8"
    );

    const profile = await readCraftProfile(tempRoot);

    expect(profile.voiceRules).toEqual(defaultCraftProfile.voiceRules);
    expect(profile.antiPatterns).toEqual(defaultCraftProfile.antiPatterns);
    expect(profile.sceneContracts).toEqual(defaultCraftProfile.sceneContracts);
  });
});
