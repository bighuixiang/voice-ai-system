export function evaluateWriteAuthority(input: { writer: string; authoritativeWriter: string; operation: "patch" | "replace" }): { status: "allowed" | "blocked"; reason?: string; writes: boolean } {
  if (input.writer !== input.authoritativeWriter) return { status: "blocked", reason: "NON_AUTHORITATIVE_WRITER", writes: false };
  if (input.operation === "replace") return { status: "blocked", reason: "LEGACY_REPLACE_DISABLED", writes: false };
  return { status: "allowed", writes: true };
}
