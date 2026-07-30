import crypto from "node:crypto";

export type AuthorLockMode = "preserve_exact" | "preserve_meaning" | "preserve_function";
export interface AuthorParagraphLockResult { schemaVersion: "author-paragraph-lock.v1"; lockSetId: string; paragraphId: string; appliedText: string; lockResults: Array<{ lockId: string; mode: AuthorLockMode; status: "preserved" | "violated"; detail: string }>; status: "ready" | "blocked"; authorEditedAt: string; sourceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateAuthorParagraphLocks(input: { lockSetId: string; paragraphId: string; authorText: string; candidateText: string; locks: readonly { lockId: string; mode: AuthorLockMode; text: string }[]; authorEditedAt: string; sourceRefs: readonly string[] }): AuthorParagraphLockResult {
  if (!input.lockSetId.trim() || !input.paragraphId.trim() || !input.authorText.trim() || !input.candidateText.trim() || !input.authorEditedAt.trim()) throw new Error("AUTHOR_LOCK_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("AUTHOR_LOCK_EVIDENCE_REQUIRED");
  if (input.locks.some((lock) => !["preserve_exact", "preserve_meaning", "preserve_function"].includes(lock.mode))) throw new Error("AUTHOR_LOCK_MODE_INVALID");
  const lockResults = input.locks.map((lock) => {
    const exact = input.candidateText.includes(lock.text); const author = input.authorText.includes(lock.text);
    const preserved = lock.mode === "preserve_exact" ? author : exact || author;
    return { lockId: lock.lockId, mode: lock.mode, status: preserved ? "preserved" as const : "violated" as const, detail: preserved ? "Author lock retained in applied text." : "Candidate dropped the locked text or its declared function." };
  });
  const appliedText = input.authorText;
  const base = { schemaVersion: "author-paragraph-lock.v1" as const, lockSetId: input.lockSetId, paragraphId: input.paragraphId, appliedText, lockResults, status: lockResults.some((item) => item.status === "violated") ? "blocked" as const : "ready" as const, authorEditedAt: input.authorEditedAt, sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
