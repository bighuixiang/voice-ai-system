export function evaluateLegacyProjectOpen(input: { schemaVersion: number; currentSchemaVersion: number; implicitMigrationRequested: boolean }): { status: "opened" | "blocked"; migrationRequired: boolean; writes: false } {
  const validVersions = Number.isInteger(input.schemaVersion) && input.schemaVersion >= 1 && Number.isInteger(input.currentSchemaVersion) && input.currentSchemaVersion >= 1 && input.schemaVersion <= input.currentSchemaVersion;
  const migrationRequired = !validVersions || input.schemaVersion < input.currentSchemaVersion;
  const blocked = !validVersions || migrationRequired && input.implicitMigrationRequested;
  return { status: blocked ? "blocked" : "opened", migrationRequired, writes: false };
}
