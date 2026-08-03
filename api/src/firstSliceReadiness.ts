export function auditFirstSlice(input: { authorUtterancePersisted: boolean; sessionPersisted: boolean; understandingSnapshotPersisted: boolean; uniqueQuestionCount: number; survivesRestart: boolean; canonWritten: boolean }): { status: "ready" | "blocked"; blockers: string[]; canonWritten: false } {
  const blockers = [
    ...(!input.authorUtterancePersisted ? ["AUTHOR_UTTERANCE_MISSING"] : []),
    ...(!input.sessionPersisted ? ["SESSION_MISSING"] : []),
    ...(!input.understandingSnapshotPersisted ? ["UNDERSTANDING_SNAPSHOT_MISSING"] : []),
    ...(input.uniqueQuestionCount !== 1 ? ["UNIQUE_QUESTION_REQUIRED"] : []),
    ...(!input.survivesRestart ? ["RESTART_RECOVERY_FAILED"] : []),
    ...(input.canonWritten ? ["FIRST_SLICE_CANON_WRITE_FORBIDDEN"] : [])
  ];
  return { status: blockers.length ? "blocked" : "ready", blockers, canonWritten: false };
}
