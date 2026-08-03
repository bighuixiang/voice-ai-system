export function consumeSafeExploration(input: { budget: number; used: number; sceneCritical: boolean; canonWrite: boolean; authorRejected: boolean }): { status: "allowed" | "stopped"; remaining: number; contaminatesCanon: false } {
  const remaining = Math.max(0, input.budget - input.used);
  const allowed = remaining > 0 && !input.sceneCritical && !input.canonWrite && !input.authorRejected;
  return { status: allowed ? "allowed" : "stopped", remaining, contaminatesCanon: false };
}
