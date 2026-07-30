import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { auditContextRecords } from "./contextIntegrityGate.js";

const fp = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("context integrity gate", () => {
  it("passes contiguous authoritative records with valid fingerprints", () => {
    const first = { id: "r-1", sequence: 1, value: "A" };
    const second = { id: "r-2", sequence: 2, value: "B" };
    expect(auditContextRecords({ authoritative: true, records: [{ payload: first, fingerprint: fp(first) }, { payload: second, fingerprint: fp(second) }] })).toMatchObject({ status: "pass", validRecordIds: ["r-1", "r-2"] });
  });

  it("blocks malformed, missing-sequence or hash-mismatched authoritative data", () => {
    const result = auditContextRecords({ authoritative: true, records: [{ payload: { id: "r-1", sequence: 1 }, fingerprint: "bad" }, { raw: "not-json" }] });
    expect(result).toMatchObject({ status: "block", validRecordIds: [] });
    expect(result.reasons).toEqual(expect.arrayContaining(["HASH_MISMATCH", "MALFORMED_RECORD", "SEQUENCE_GAP"]));
  });
});
