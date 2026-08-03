export type MemoryAudience = "author" | "reader" | "character" | "model-task";
export type MemorySourceVisibility = "author-only" | "reader-visible" | "character-visible" | "public";
export interface MemoryVisibilityDecision { allowed: boolean; reason: string; }

export interface SourceVisibilityInput {
  audience: MemoryAudience;
  sourceType: string;
  sourceVisibility: MemorySourceVisibility;
  authorized: boolean;
  secret?: boolean;
}

export function evaluateSourceVisibility(input: SourceVisibilityInput): MemoryVisibilityDecision {
  if (!input.authorized) return { allowed: false, reason: "SOURCE_PERMISSION_REQUIRED" };
  if (input.secret && input.audience !== "author") return { allowed: false, reason: "SOURCE_SECRET_BOUNDARY" };
  if (input.sourceVisibility === "author-only" && input.audience !== "author") {
    if (input.audience === "model-task") return { allowed: false, reason: "MODEL_TASK_SOURCE_VISIBILITY_REQUIRED" };
    return { allowed: false, reason: "AUTHOR_ONLY_SOURCE" };
  }
  if (input.audience === "reader" && input.sourceVisibility === "character-visible") return { allowed: false, reason: "CHARACTER_ONLY_SOURCE" };
  if (input.audience === "character" && input.sourceVisibility === "reader-visible") return { allowed: false, reason: "READER_ONLY_SOURCE" };
  return { allowed: true, reason: "SOURCE_VISIBILITY_ALLOWED" };
}

export function evaluateMemoryVisibility(input: { audience: MemoryAudience; epistemicType: string; sourceVisibility: MemorySourceVisibility; authorized: boolean; secret?: boolean }): MemoryVisibilityDecision {
  if (!input.authorized) return { allowed: false, reason: "MEMORY_PERMISSION_REQUIRED" };
  if (input.secret && input.audience !== "author") return { allowed: false, reason: "MEMORY_SECRET_BOUNDARY" };
  if (input.sourceVisibility === "author-only" && input.audience !== "author") return { allowed: false, reason: "AUTHOR_ONLY_MEMORY" };
  if (input.audience === "reader" && input.sourceVisibility === "character-visible") return { allowed: false, reason: "CHARACTER_ONLY_MEMORY" };
  if (input.audience === "character" && input.sourceVisibility === "reader-visible") return { allowed: false, reason: "READER_ONLY_MEMORY" };
  if (input.audience === "model-task" && input.sourceVisibility !== "public" && input.epistemicType === "author_truth") return { allowed: false, reason: "MODEL_TASK_AUTHOR_TRUTH_BLOCKED" };
  return { allowed: true, reason: "MEMORY_VISIBILITY_ALLOWED" };
}
