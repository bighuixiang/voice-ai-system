import { describe, expect, it } from "vitest";
import { createForeshadowing, transitionForeshadowing, recordForeshadowingEvidence, createFalseClueFairness } from "./foreshadowing.js";

describe("foreshadowing lifecycle", () => {
  it("creates a stable first-class foreshadowing entity", () => {
    const item = createForeshadowing({ projectId: "demo", sequence: 1, title: "Brass door", surfacePerception: "door hums", meaning: "portal", secrecy: "author-secret", type: "object", source: "author", plannedWindow: "chapter-1", payoffWindow: "chapter-5", payoffMode: "choice", dependencies: [], affectedCharacters: ["courier"] });
    expect(item.foreshadowingId).toBe("FS-demo-001");
    expect(item.status).toBe("candidate");
  });

  it("enforces lifecycle transitions and preserves change history", () => {
    const item = createForeshadowing({ projectId: "demo", sequence: 2, title: "Key", surfacePerception: "cold key", meaning: "portal", secrecy: "collaborator", type: "object", source: "system", plannedWindow: "chapter-1", payoffWindow: "chapter-3", payoffMode: "reveal", dependencies: [], affectedCharacters: [] });
    const approved = transitionForeshadowing(item, "approved", "author accepted");
    expect(approved.status).toBe("approved");
    expect(approved.history).toHaveLength(1);
  });

  it("requires exact setup/payoff anchors and supports reinforcement", () => {
    const item = createForeshadowing({ projectId: "demo", sequence: 3, title: "Mark", surfacePerception: "scar", meaning: "old oath", secrecy: "reader-visible", type: "relationship", source: "text", plannedWindow: "chapter-1", payoffWindow: "chapter-4", payoffMode: "consequence", dependencies: [], affectedCharacters: ["a"] });
    const planned = transitionForeshadowing(transitionForeshadowing(item, "approved", "author accepted"), "planned", "chapter plan");
    const seeded = recordForeshadowingEvidence(planned, { kind: "setup", anchor: "manuscript://v1#1-4", chapter: "chapter-1" });
    expect(seeded.status).toBe("seeded");
    const reinforced = recordForeshadowingEvidence(seeded, { kind: "reinforced", anchor: "manuscript://v1#20-24", chapter: "chapter-2" });
    expect(reinforced.status).toBe("reinforced");
  });

  it("requires visible counterevidence and correction path for fair false clues", () => {
    const result = createFalseClueFairness({ foreshadowingId: "FS-demo-004", maker: "antagonist", whyBelievable: "forged ledger", counterEvidenceRefs: ["manuscript://v1#30-40"], correctionMode: "reveal-forgery", readerReinterpretation: "ledger was planted" });
    expect(result.fair).toBe(true);
  });
});
