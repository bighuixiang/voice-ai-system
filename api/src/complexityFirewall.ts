const INTERNAL_TERMS = /\b(ContextManifest|fencing|schema|provider|token|SSE|checkpoint)\b/i;

export type AuthorSurfaceLayer = "primary" | "evidence" | "diagnostic";

export interface ComplexityFirewallDecision {
  allowed: boolean;
  layer: AuthorSurfaceLayer;
  reason: "成果语言" | "内部术语仅限证据层";
}

export function evaluateComplexityFirewall(input: { layer: AuthorSurfaceLayer; text: string }): ComplexityFirewallDecision {
  if (!input.text.trim()) throw new Error("COMPLEXITY_FIREWALL_TEXT_REQUIRED");
  const internal = INTERNAL_TERMS.test(input.text);
  if (internal && input.layer === "primary") return { allowed: false, layer: input.layer, reason: "内部术语仅限证据层" };
  return { allowed: true, layer: input.layer, reason: "成果语言" };
}

export function assertAuthorStepComplexity(input: { internalComponentCount: number; authorStepCount: number }): void {
  if (!Number.isInteger(input.internalComponentCount) || input.internalComponentCount < 0 || !Number.isInteger(input.authorStepCount) || input.authorStepCount < 0) throw new Error("COMPLEXITY_COUNTS_INVALID");
  if (input.internalComponentCount > 0 && input.authorStepCount > 3) throw new Error("AUTHOR_STEPS_COMPLEXITY_LEAK");
}
