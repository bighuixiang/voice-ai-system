import { describe, expect, it } from "vitest";
import { assertAuthorStepComplexity, evaluateComplexityFirewall } from "./complexityFirewall.js";

describe("complexity firewall", () => {
  it("keeps primary surfaces in outcome language", () => {
    expect(evaluateComplexityFirewall({ layer: "primary", text: "查看下一章候选" }).allowed).toBe(true);
    expect(evaluateComplexityFirewall({ layer: "primary", text: "查看 ContextManifest" }).allowed).toBe(false);
    expect(evaluateComplexityFirewall({ layer: "evidence", text: "ContextManifest checkpoint" }).allowed).toBe(true);
  });

  it("prevents internal components from multiplying author steps", () => {
    expect(() => assertAuthorStepComplexity({ internalComponentCount: 8, authorStepCount: 4 })).toThrow("AUTHOR_STEPS_COMPLEXITY_LEAK");
    expect(() => assertAuthorStepComplexity({ internalComponentCount: 8, authorStepCount: 3 })).not.toThrow();
  });
});
