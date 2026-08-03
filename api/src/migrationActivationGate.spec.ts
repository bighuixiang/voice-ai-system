import { describe, expect, it } from "vitest";
import { evaluateMigrationActivation } from "./migrationActivationGate.js";

describe("migration activation", () => {
  it("keeps failed validation closed", () => { expect(evaluateMigrationActivation({ migrated: true, validationPassed: false, activationRequested: true, migrationRuns: 1 })).toEqual({ status: "validation_failed", newWritesEnabled: false, rerunMigration: false }); });
  it("activates without rerunning migration", () => { expect(evaluateMigrationActivation({ migrated: true, validationPassed: true, activationRequested: true, migrationRuns: 1 }).status).toBe("active"); });
  it("fails closed when migration run count is invalid", () => { expect(evaluateMigrationActivation({ migrated: true, validationPassed: true, activationRequested: true, migrationRuns: Number.NaN })).toEqual({ status: "blocked", newWritesEnabled: false, rerunMigration: false }); });
});
