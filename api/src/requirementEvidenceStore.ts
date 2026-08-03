import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { RequirementEvidenceLink } from "./deliveryGovernance.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function evidencePath(root: string, requirementId: string, sliceId: string): string {
  return resolveInside(root, `sessions/requirement-evidence/${hash({ requirementId, sliceId }).slice(0, 32)}.json`);
}
function assertIntegrity(link: RequirementEvidenceLink): void {
  const { fingerprint, ...base } = link;
  if (hash(base) !== fingerprint) throw new Error("REQUIREMENT_EVIDENCE_INTEGRITY_FAILED");
}

export async function writeRequirementEvidenceLink(root: string, link: RequirementEvidenceLink): Promise<RequirementEvidenceLink> {
  assertIntegrity(link);
  const target = evidencePath(root, link.requirementId, link.sliceId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(link, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return link;
}

export async function readRequirementEvidenceLink(root: string, requirementId: string, sliceId: string, projectSlug?: string): Promise<RequirementEvidenceLink | null> {
  try {
    const link = JSON.parse(await fs.readFile(evidencePath(root, requirementId, sliceId), "utf8")) as RequirementEvidenceLink;
    if (link.schemaVersion !== "requirement-evidence-link.v1" || link.requirementId !== requirementId || link.sliceId !== sliceId || (projectSlug && link.projectSlug !== projectSlug)) throw new Error("REQUIREMENT_EVIDENCE_INVALID");
    assertIntegrity(link);
    return link;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
