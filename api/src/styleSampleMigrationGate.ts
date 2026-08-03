export function migrateLegacyStyleSample(input: { id: string; tags: string[]; excerpt: string; useCase: string }): { status: "legacy_unproven"; excerptInjected: false; warning: string; requiresSupplementalSource: true } {
  return { status: "legacy_unproven", excerptInjected: false, warning: "LEGACY_STYLE_SAMPLE_ISOLATED", requiresSupplementalSource: true };
}
