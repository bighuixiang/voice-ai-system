export function evaluateMigrationActivation(input: { migrated: boolean; validationPassed: boolean; activationRequested: boolean; migrationRuns: number }): { status: "migrated" | "validation_failed" | "active" | "blocked"; newWritesEnabled: boolean; rerunMigration: boolean } {
  if (!input.migrated) return { status: "blocked", newWritesEnabled: false, rerunMigration: false };
  if (!input.validationPassed) return { status: "validation_failed", newWritesEnabled: false, rerunMigration: false };
  if (!input.activationRequested) return { status: "migrated", newWritesEnabled: false, rerunMigration: false };
  if (!Number.isInteger(input.migrationRuns) || input.migrationRuns < 1) return { status: "blocked", newWritesEnabled: false, rerunMigration: false };
  return { status: "active", newWritesEnabled: true, rerunMigration: input.migrationRuns > 1 };
}
