import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface Rp3AuthorAcceptance {
  schemaVersion: "rp3-author-acceptance.v1";
  status: "accepted" | "rejected";
  actorId: string;
  authorizationId: string;
  evidenceRefs: string[];
  acceptedAt: string;
  fingerprint: string;
}

type Input = Pick<Rp3AuthorAcceptance, "status" | "actorId" | "authorizationId" | "evidenceRefs">;
const targetPath = (root: string) => path.join(root, "rp3-author-acceptance.json");

function fingerprint(value: Omit<Rp3AuthorAcceptance, "fingerprint" | "acceptedAt"> & { acceptedAt: string }): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertRp3AuthorAcceptanceIntegrity(value: Rp3AuthorAcceptance): Rp3AuthorAcceptance {
  if (value.schemaVersion !== "rp3-author-acceptance.v1" || !["accepted", "rejected"].includes(value.status) || !value.actorId.trim() || !value.authorizationId.trim() || !Array.isArray(value.evidenceRefs) || !value.evidenceRefs.length || value.evidenceRefs.some((ref) => typeof ref !== "string" || !/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(ref.trim())) || !Number.isFinite(Date.parse(value.acceptedAt))) throw new Error("RP3_AUTHOR_ACCEPTANCE_INTEGRITY_FAILED");
  const { fingerprint: _fingerprint, ...base } = value;
  if (!/^[a-f0-9]{64}$/i.test(value.fingerprint) || fingerprint(base) !== value.fingerprint) throw new Error("RP3_AUTHOR_ACCEPTANCE_INTEGRITY_FAILED");
  return value;
}

export async function readRp3AuthorAcceptance(root: string): Promise<Rp3AuthorAcceptance | null> {
  try {
    return assertRp3AuthorAcceptanceIntegrity(JSON.parse(await fs.readFile(targetPath(root), "utf8")) as Rp3AuthorAcceptance);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    if (error instanceof Error && error.message === "RP3_AUTHOR_ACCEPTANCE_INTEGRITY_FAILED") throw new Error("RP3_AUTHOR_ACCEPTANCE_CORRUPT");
    throw error;
  }
}

export async function persistRp3AuthorAcceptance(root: string, input: Input): Promise<Rp3AuthorAcceptance> {
  if (!input.actorId.trim() || !input.authorizationId.trim() || !input.evidenceRefs.length || input.evidenceRefs.some((ref) => !/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(ref.trim()))) throw new Error("RP3_AUTHOR_ACCEPTANCE_INPUT_INVALID");
  const existing = await readRp3AuthorAcceptance(root);
  if (existing) {
    const same = existing.status === input.status && existing.actorId === input.actorId && existing.authorizationId === input.authorizationId && JSON.stringify(existing.evidenceRefs) === JSON.stringify(input.evidenceRefs);
    if (same) return existing;
    throw new Error("RP3_AUTHOR_ACCEPTANCE_ALREADY_RECORDED");
  }
  const base = { schemaVersion: "rp3-author-acceptance.v1" as const, ...input, evidenceRefs: [...input.evidenceRefs], acceptedAt: new Date().toISOString() };
  const record: Rp3AuthorAcceptance = { ...base, fingerprint: fingerprint(base) };
  assertRp3AuthorAcceptanceIntegrity(record);
  await fs.mkdir(root, { recursive: true });
  const temporary = `${targetPath(root)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporary, targetPath(root));
  return record;
}
