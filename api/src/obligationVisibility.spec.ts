import { describe, expect, it } from "vitest";
import { projectObligationExit } from "./obligationGovernance.js";

describe("obligation visibility exits", () => {
  it("redacts author truth consistently across every non-author exit", () => {
    for (const exit of ["api", "sse", "search", "notification", "deep-link", "mobile", "reader-export"] as const) {
      const result = projectObligationExit({ obligationId: "obl-1", authorSecret: "killer is inside", readerVisible: "玉佩义务即将到期", publicMetadata: "mystery-1", authorSecretAuthorized: false, exit });
      expect(result).toMatchObject({ exit, status: "approaching_due", message: "玉佩义务即将到期" });
      expect(result).not.toHaveProperty("secret");
      expect(JSON.stringify(result)).not.toContain("killer");
    }
  });

  it("allows the author detail only with explicit secret authorization", () => {
    expect(projectObligationExit({ obligationId: "obl-1", authorSecret: "killer is inside", readerVisible: "due", publicMetadata: "mystery-1", authorSecretAuthorized: true, exit: "api" })).toMatchObject({ status: "author-detail", secret: "killer is inside" });
  });
});
