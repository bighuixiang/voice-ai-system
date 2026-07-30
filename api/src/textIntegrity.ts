import crypto from "node:crypto";

export interface TextProfile {
  schemaVersion: "text-profile.v1";
  profileId: "plain-markdown-v1";
  newline: "lf" | "crlf" | "cr" | "mixed";
  trailingNewline: boolean;
  protectedBlocks: number;
  sourceFingerprint: string;
}

export interface TextRoundTripProof {
  schemaVersion: "text-round-trip-proof.v1";
  status: "passed" | "blocked";
  normalized: false;
  originalFingerprint: string;
  reconstructedFingerprint: string;
  diagnostics: string[];
}

function hash(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }

export function buildTextProfile(content: string): TextProfile {
  const newlineMatches = content.match(/\r\n|\r|\n/g) ?? [];
  const kinds = new Set(newlineMatches.map((value) => value === "\r\n" ? "crlf" : value === "\r" ? "cr" : "lf"));
  const newline = kinds.size === 0 ? "lf" : kinds.size > 1 ? "mixed" : [...kinds][0] as TextProfile["newline"];
  const protectedBlocks = (content.match(/^```[^\r\n]*(?:\r\n|\r|\n)[\s\S]*?^```[ \t]*(?=\r?$|\n)/gm) ?? []).length;
  return {
    schemaVersion: "text-profile.v1",
    profileId: "plain-markdown-v1",
    newline,
    trailingNewline: /(?:\r\n|\r|\n)$/.test(content),
    protectedBlocks,
    sourceFingerprint: hash(content)
  };
}

export function verifyTextRoundTrip(content: string, profile: TextProfile): TextRoundTripProof {
  const diagnostics: string[] = [];
  if (content.includes("\u0000")) diagnostics.push("nul-byte");
  const reconstructed = content;
  if (profile.schemaVersion !== "text-profile.v1" || profile.profileId !== "plain-markdown-v1") diagnostics.push("profile-unsupported");
  if (profile.sourceFingerprint !== hash(content)) diagnostics.push("source-fingerprint-mismatch");
  if (buildTextProfile(content).newline !== profile.newline) diagnostics.push("newline-profile-mismatch");
  const originalFingerprint = hash(content);
  const reconstructedFingerprint = hash(reconstructed);
  if (originalFingerprint !== reconstructedFingerprint) diagnostics.push("round-trip-mismatch");
  return {
    schemaVersion: "text-round-trip-proof.v1",
    status: diagnostics.length ? "blocked" : "passed",
    normalized: false,
    originalFingerprint,
    reconstructedFingerprint,
    diagnostics
  };
}
