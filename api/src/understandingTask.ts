export const V2_UNDERSTANDING_DEPENDENCIES = [
  "task-risk-profile",
  "t0-context-manifest",
  "budget-reservation",
  "model-capability-authorization"
] as const;

export function missingUnderstandingDependencies() {
  return [...V2_UNDERSTANDING_DEPENDENCIES];
}

