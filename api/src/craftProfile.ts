import fs from "node:fs/promises";
import type { CraftGenreProfile, CraftProfile, NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";

async function readOptionalJson<T>(root: string, relativePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(resolveInside(root, relativePath), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

const defaultGenreProfiles: CraftGenreProfile[] = [
  {
    patterns: ["玄幻", "xuanhuan", "fantasy"],
    title: "Xuanhuan upgrade craft",
    formulas: [
      "Every progression beat needs setup, visible cost, and a delayed consequence.",
      "Pressure should come from hierarchy, resource scarcity, oath, bloodline, seal, sect, or public humiliation.",
      "A satisfying payoff must change status, leverage, relationship, or knowledge."
    ],
    requiredBeats: ["progression", "payoff", "hook"],
    risks: ["free power-up", "villain exits without consequence", "new setting replaces character choice"]
  },
  {
    patterns: ["悬疑", "suspense", "mystery"],
    title: "Mystery clue craft",
    formulas: [
      "Each clue must answer one small question and open a sharper one.",
      "Misdirection should come from character motive, not author concealment.",
      "Payoffs must be traceable to earlier sensory, behavioral, or timeline evidence."
    ],
    requiredBeats: ["foreshadow_setup", "reversal", "hook"],
    risks: ["unearned reveal", "omniscient hint", "coincidence-driven investigation"]
  },
  {
    patterns: ["言情", "romance"],
    title: "Romance pressure craft",
    formulas: [
      "External plot must alter emotional position between the leads.",
      "Intimacy should be earned through action, concession, vulnerability, or misread intent.",
      "Relationship turns need a concrete behavior change after the scene."
    ],
    requiredBeats: ["relationship_turn", "payoff", "setback"],
    risks: ["sugar without conflict", "repeated misunderstanding", "emotion without action"]
  }
];

export const defaultCraftProfile: CraftProfile = {
  version: 1,
  title: "Novel craft autopilot profile",
  principles: [
    "Character texture comes from desire, wound, misbelief, pressure, and observable choice.",
    "Small characters still need one specific high-light moment when their value becomes plot-relevant.",
    "A satisfying beat needs setup, cost, action, payoff, and aftershock.",
    "Foreshadowing is healthy only when setup, tracking, payoff, or intentional delay is visible.",
    "Slice-of-life scenes must advance relationship, information, emotion, or future setup."
  ],
  beatDefinitions: [
    { type: "payoff", label: "Satisfying payoff", purpose: "Deliver reader reward after pressure, setup, and cost." },
    { type: "foreshadow_setup", label: "Foreshadow setup", purpose: "Plant a traceable clue, object, promise, wound, or contradiction." },
    { type: "foreshadow_payoff", label: "Foreshadow payoff", purpose: "Resolve or escalate an earlier setup without breaking causality." },
    { type: "reversal", label: "Reversal", purpose: "Change the reader and character understanding of the scene." },
    { type: "setback", label: "Setback", purpose: "Make victory incomplete and create forward pressure." },
    { type: "progression", label: "Progression", purpose: "Move power, status, resource, skill, or plan by a believable increment." },
    { type: "redemption", label: "Redemption", purpose: "Let a wound or mistake become a costly corrective choice." },
    { type: "sublimation", label: "Sublimation", purpose: "Turn a private desire into a larger value, responsibility, or oath." },
    { type: "slice_of_life", label: "Slice of life", purpose: "Advance ordinary life while carrying relationship, information, or emotional motion." },
    { type: "relationship_turn", label: "Relationship turn", purpose: "Shift trust, debt, hostility, intimacy, or obligation." },
    { type: "hook", label: "Hook", purpose: "End with an unresolved consequence, question, danger, or opportunity." }
  ],
  genreProfiles: defaultGenreProfiles,
  qualityGates: [
    "Every planned required CraftBeat should be visible in scene cards or recap patches.",
    "Progression without cost is a review risk.",
    "Foreshadowing setup without tracking or payoff must remain in a ledger.",
    "Slice-of-life scenes without relationship, information, emotion, or setup value are low-value scenes.",
    "Major character state changes must remain pending until author approval."
  ]
};

function validCraftProfile(profile?: Partial<CraftProfile>): profile is CraftProfile {
  return Boolean(
    profile?.version === 1 &&
      profile.title?.trim() &&
      Array.isArray(profile.principles) &&
      Array.isArray(profile.beatDefinitions) &&
      Array.isArray(profile.genreProfiles) &&
      Array.isArray(profile.qualityGates)
  );
}

function mergeCraftProfile(override?: Partial<CraftProfile>): CraftProfile {
  if (!override) return defaultCraftProfile;
  return {
    ...defaultCraftProfile,
    ...override,
    version: 1,
    principles: override.principles?.length ? override.principles : defaultCraftProfile.principles,
    beatDefinitions: override.beatDefinitions?.length ? override.beatDefinitions : defaultCraftProfile.beatDefinitions,
    genreProfiles: override.genreProfiles?.length ? override.genreProfiles : defaultCraftProfile.genreProfiles,
    qualityGates: override.qualityGates?.length ? override.qualityGates : defaultCraftProfile.qualityGates
  };
}

export async function readCraftProfile(root: string): Promise<CraftProfile> {
  const override = await readOptionalJson<Partial<CraftProfile>>(root, "bible/craft-profile.json");
  return validCraftProfile(mergeCraftProfile(override)) ? mergeCraftProfile(override) : defaultCraftProfile;
}

export async function buildCraftProfileBlock(root: string, project: NovelProject): Promise<{ title: string; content: string }> {
  const profile = await readCraftProfile(root);
  const hasProjectProfile = Boolean(await readOptionalJson<Partial<CraftProfile>>(root, "bible/craft-profile.json"));
  const source = `${project.genre || ""} ${project.roughIdea || ""}`.toLowerCase();
  const matchedGenreProfiles = profile.genreProfiles.filter((item) => item.patterns?.some((pattern) => source.includes(pattern.toLowerCase())));
  return {
    title: "Craft Profile",
    content: JSON.stringify(
      {
        source: hasProjectProfile ? "project:bible/craft-profile.json" : "built-in defaults",
        title: profile.title,
        principles: profile.principles,
        beatDefinitions: profile.beatDefinitions,
        matchedGenreProfiles,
        qualityGates: profile.qualityGates
      },
      null,
      2
    )
  };
}
