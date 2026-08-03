export function assertRuntimeControlFreshness(runUpdatedAt: string, expectedUpdatedAt: unknown): void {
  if (expectedUpdatedAt === undefined || expectedUpdatedAt === null || expectedUpdatedAt === "") return;
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt !== runUpdatedAt) throw new Error("RUNTIME_CONTROL_STALE");
}
