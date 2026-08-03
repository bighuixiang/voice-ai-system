import crypto from "node:crypto";
export type ProseBlockMode = "scene" | "exposition" | "description";
export interface ProseSpecificityBlock { blockId: string; text: string; mode: ProseBlockMode; linkedFunction: "perception" | "conflict" | "choice" | "consequence" | null; hasSensoryEvidence: boolean; changesAction: boolean; }
export interface ProseSpecificityInput { sceneId: string; blocks: ProseSpecificityBlock[]; sourceRefs: string[]; }
export interface ProseSpecificityReport { schemaVersion: "prose-specificity-report.v1"; sceneId: string; status: "passed" | "blocked"; issues: string[]; blockFindings: Array<{ blockId: string; issues: string[] }>; fingerprint: string; }
function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function evaluateProseSpecificity(input: ProseSpecificityInput): ProseSpecificityReport {
  const issues: string[] = [];
  const blockFindings: ProseSpecificityReport["blockFindings"] = [];
  if (!input.sceneId.trim()) issues.push("SPECIFICITY_CONTEXT_REQUIRED");
  const blockIds = input.blocks.map((block) => block.blockId.trim());
  if (blockIds.some((id) => !id) || new Set(blockIds).size !== blockIds.length) issues.push("SPECIFICITY_BLOCK_DUPLICATE");
  let expositionRun = 0;
  for (const block of input.blocks) {
    const found: string[] = [];
    expositionRun = block.mode === "exposition" ? expositionRun + 1 : 0;
    if (expositionRun >= 2 || (block.mode === "exposition" && !block.linkedFunction)) found.push("CONTINUOUS_EXPOSITION");
    if (block.mode === "exposition" && !block.linkedFunction) found.push("SETTING_DUMP");
    if ((/(瀹忓ぇ|姘告亽|浼熷ぇ|缁堟瀬|鍛借繍|鏃犲敖|宏大|永恒|伟大|命运)/.test(block.text) || (block.mode === "exposition" && block.text.length > 30)) && !block.changesAction) found.push("GRANDIOSE_ABSTRACTION");
    const sensoryWords = (block.text.match(/[,，。！？、]/g) || []).length;
    if (block.mode === "description" && sensoryWords >= 5 && !block.changesAction) found.push("SENSORY_LIST_STACK");
    if (!block.linkedFunction && !block.changesAction) found.push("UNLINKED_ABSTRACTION");
    if (found.length) { blockFindings.push({ blockId: block.blockId, issues: found }); for (const issue of found) if (!issues.includes(issue)) issues.push(issue); }
  }
  if (!input.sourceRefs.length || input.sourceRefs.some((ref) => !ref.trim())) issues.push("SPECIFICITY_EVIDENCE_REQUIRED");
  if (input.blocks.some((block) => !block.hasSensoryEvidence && !block.changesAction && !block.linkedFunction)) issues.push("CONCRETE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "prose-specificity-report.v1" as const, sceneId: input.sceneId, status: issues.length ? "blocked" as const : "passed" as const, issues: [...new Set(issues)], blockFindings };
  return { ...base, fingerprint: hash(base) };
}
