import { describe, expect, it } from "vitest";
import { evaluateLegacyProjectOpen } from "./legacyProjectOpenGate.js";

describe("legacy project open", () => {
  it("blocks implicit migration", () => {
    expect(evaluateLegacyProjectOpen({ schemaVersion: 1, currentSchemaVersion: 2, implicitMigrationRequested: true })).toEqual({ status: "blocked", migrationRequired: true, writes: false });
  });

  it("fails closed for invalid schema versions", () => {
    expect(evaluateLegacyProjectOpen({ schemaVersion: Number.NaN, currentSchemaVersion: 2, implicitMigrationRequested: false })).toEqual({ status: "blocked", migrationRequired: true, writes: false });
  });
});
