import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { ObligationPublication } from "./obligationPublication.js";

export interface ObligationPublicationAudit { schemaVersion: "obligation-publication-audit.v1"; publicationId: string; version: string; status: "passed" | "blocked"; blockers: string[]; sourceFingerprint: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function filePath(root: string, publicationId: string, version: string): string { return resolveInside(root, path.join("sessions", "obligation-publications", `${publicationId}-${version}.json`)); }
async function writeImmutable(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); try { const existing = await fs.readFile(target, "utf8"); if (existing !== `${JSON.stringify(value, null, 2)}\n`) throw new Error("OBLIGATION_PUBLICATION_IMMUTABLE_CONFLICT"); return; } catch (error) { if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error; } await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
export async function persistObligationPublication(root: string, publication: ObligationPublication): Promise<ObligationPublication> { await writeImmutable(filePath(root, publication.publicationId, publication.version), publication); return publication; }
export async function readObligationPublication(root: string, publicationId: string, version: string): Promise<ObligationPublication | null> { try { return JSON.parse(await fs.readFile(filePath(root, publicationId, version), "utf8")) as ObligationPublication; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export function auditObligationPublication(publication: ObligationPublication): ObligationPublicationAudit { const blockers = publication.auditView.obligations.filter((item) => item.status !== "paid" || !item.evidenceFingerprint.trim()).map((item) => item.obligationId); const base = { schemaVersion: "obligation-publication-audit.v1" as const, publicationId: publication.publicationId, version: publication.version, status: blockers.length ? "blocked" as const : "passed" as const, blockers, sourceFingerprint: publication.fingerprint }; return { ...base, fingerprint: hash(base) }; }
