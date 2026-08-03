export function isolateFeedbackProject(input: { projectSlug: string; requestedProjectSlug: string; forgotten: boolean; publishedAuditRefs: readonly string[] }): { allowed: boolean; futureContext: "include" | "exclude"; audit: { retainEventExistence: boolean; refs: string[] } } {
  if (!input.projectSlug.trim() || !input.requestedProjectSlug.trim()) throw new Error("FEEDBACK_PROJECT_FIELDS_REQUIRED");
  const same = input.projectSlug === input.requestedProjectSlug;
  return { allowed: same, futureContext: same && !input.forgotten ? "include" : "exclude", audit: { retainEventExistence: input.publishedAuditRefs.length > 0, refs: [...input.publishedAuditRefs] } };
}
