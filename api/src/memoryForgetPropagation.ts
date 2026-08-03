export interface ScopedMemory { memoryId: string; scope: "scene" | "chapter" | "project"; scopeId: string; content: string; status: "effective" | "forgotten"; }
export interface ForgetPropagationResult { memory: ScopedMemory; indexAction: "remove"; cacheAction: "invalidate"; futureContextAction: "exclude"; historyAction: "preserve"; tombstone: { memoryId: string; reason: string; contentIncluded: false }; }

export function propagateMemoryForget(input: { memory: ScopedMemory; reason: string; indexContains: boolean; cacheContains: boolean; publishedVersionRefs: readonly string[] }): ForgetPropagationResult {
  if (!input.reason.trim()) throw new Error("MEMORY_FORGET_REASON_REQUIRED");
  if (input.memory.status === "forgotten") throw new Error("MEMORY_ALREADY_FORGOTTEN");
  return {
    memory: { ...input.memory, status: "forgotten" },
    indexAction: "remove",
    cacheAction: "invalidate",
    futureContextAction: "exclude",
    historyAction: "preserve",
    tombstone: { memoryId: input.memory.memoryId, reason: input.reason, contentIncluded: false }
  };
}
