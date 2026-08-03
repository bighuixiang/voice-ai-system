export function evaluateCrossProjectSurface(input: { sourceProject: string; targetProject: string; copiedSurface: boolean; approvedAbstractMechanism: boolean; sourcePrivateFactPresent: boolean }): { status: "allowed" | "blocked"; surfaceAccessible: boolean; reason?: string } {
  if (input.sourceProject === input.targetProject) return { status: "allowed", surfaceAccessible: true };
  if (input.copiedSurface || input.sourcePrivateFactPresent || !input.approvedAbstractMechanism) return { status: "blocked", surfaceAccessible: false, reason: "CROSS_PROJECT_SURFACE_LEAK" };
  return { status: "allowed", surfaceAccessible: false };
}
