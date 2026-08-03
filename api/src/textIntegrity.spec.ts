import { describe, expect, it } from "vitest";
import { buildTextProfile, verifyTextRoundTrip } from "./textIntegrity.js";

describe("text integrity", () => {
  it("freezes newline/trailing-newline/protected-block semantics and proves exact round trip", () => {
    const content = "# Chapter\r\n\r\n```json\r\n{\"x\":1}\r\n```\r\n";
    const profile = buildTextProfile(content);
    expect(profile).toMatchObject({ schemaVersion: "text-profile.v1", newline: "crlf", trailingNewline: true, protectedBlocks: 1 });
    expect(verifyTextRoundTrip(content, profile)).toMatchObject({ status: "passed", normalized: false });
  });

  it("blocks invalid text instead of silently normalizing it", () => {
    const profile = buildTextProfile("plain\ntext");
    expect(verifyTextRoundTrip("plain\u0000text", profile)).toMatchObject({ status: "blocked" });
    expect(verifyTextRoundTrip("plain\u0000text", profile).diagnostics).toContain("nul-byte");
  });

  it("blocks profile semantic drift even when the source bytes are unchanged", () => {
    const content = "# Chapter\n\n```json\n{\"x\":1}\n```\n";
    const profile = buildTextProfile(content);
    expect(verifyTextRoundTrip(content, { ...profile, trailingNewline: false }).diagnostics).toContain("trailing-newline-profile-mismatch");
    expect(verifyTextRoundTrip(content, { ...profile, protectedBlocks: 0 }).diagnostics).toContain("protected-block-profile-mismatch");
  });
});
