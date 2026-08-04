import path from "node:path";
import { markBookRunRepairRequired, readBookRun } from "./bookRun.js";
import { refreshBookWorkGraph } from "./bookWorkGraph.js";
import { assertClosureCertificateCurrent } from "./closureCertificate.js";
import { readCompletionAudit } from "./completionAudit.js";
import { readQuiescenceProof } from "./quiescenceProof.js";
import { auditMilestoneRepairsForRun } from "./milestoneAudit.js";
import { recordBookRunInvalidation } from "./bookRunInvalidation.js";
import { recordBookRunImpactSubgraph } from "./bookRunImpact.js";

export type BookRunClosureState = "scope_complete" | "closure_blocked" | "closure_ready" | "auditing" | "audited_complete";
export interface BookRunClosureReadiness { state: BookRunClosureState; bookRunId: string; runVersion: number; reasons: string[]; evidence: { workGraphFingerprint?: string; quiescenceProofFingerprint?: string; closureCertificateFingerprint?: string } }

export async function evaluateBookRunClosure(root: string, bookRunId: string, sourceFingerprint: string): Promise<BookRunClosureReadiness> {
  const run = await readBookRun(root, bookRunId);
  if (!run) throw new Error("BOOK_RUN_NOT_FOUND");
  if (run.status === "audited_complete") {
    const previous = run.completionAuditRef ? await readCompletionAudit(root, path.basename(run.completionAuditRef, ".json")).catch(() => null) : null;
    const currentGraph = await refreshBookWorkGraph(root);
    const currentClosure = await assertClosureCertificateCurrent(root, sourceFingerprint).catch(() => null);
    const currentQuiescence = await readQuiescenceProof(root, bookRunId, run.version - 1);
    const milestoneAudits = await auditMilestoneRepairsForRun({ root, projectSlug: run.projectSlug, bookRunId, sourceFingerprint }).catch(() => ({ audits: [], issues: [{ code: "REPAIR_ACTION_COMPLETION_REQUIRED" as const, actionId: "unknown" }] }));
    const current = Boolean(previous && previous.bookRunId === run.bookRunId && run.workGraphFingerprint === currentGraph.fingerprint && currentClosure && currentQuiescence && milestoneAudits.issues.length === 0 && previous.sourceFingerprint === sourceFingerprint.trim() && previous.runVersion === run.version - 1 && previous.workGraphFingerprint === currentGraph.fingerprint && previous.closureCertificateFingerprint === currentClosure.certificate.fingerprint && previous.quiescenceProofFingerprint === currentQuiescence.fingerprint);
    if (current) return { state: "audited_complete", bookRunId, runVersion: run.version, reasons: [], evidence: { workGraphFingerprint: currentGraph.fingerprint, quiescenceProofFingerprint: currentQuiescence!.fingerprint, closureCertificateFingerprint: currentClosure!.certificate.fingerprint } };
    const invalidation = await recordBookRunInvalidation({ root, bookRunId, projectSlug: run.projectSlug, priorRunVersion: run.version, reason: "completion-evidence-stale", sourceFingerprint, affectedArtifactRefs: ["sessions/completion", "sessions/book-work-graph.json", "sessions/closure", "sessions/quiescence", "sessions/milestone-audits"] });
    await recordBookRunImpactSubgraph({ root, invalidationId: invalidation.invalidationId, bookRunId, projectSlug: run.projectSlug, priorRunVersion: run.version, reason: "completion-evidence-stale", sourceFingerprint, workItems: currentGraph.workItems.map((item) => ({ workItemId: item.workItemId, chapterId: item.chapterId })) });
    await markBookRunRepairRequired(root, bookRunId);
    return { state: "closure_blocked", bookRunId, runVersion: run.version + 1, reasons: ["COMPLETION_AUDIT_STALE"], evidence: { workGraphFingerprint: currentGraph.fingerprint, ...(currentQuiescence ? { quiescenceProofFingerprint: currentQuiescence.fingerprint } : {}), ...(currentClosure ? { closureCertificateFingerprint: currentClosure.certificate.fingerprint } : {}) } };
  }
  if (run.status !== "scope_complete") return { state: "scope_complete", bookRunId, runVersion: run.version, reasons: ["SCOPE_NOT_COMPLETE"], evidence: {} };
  const graph = await refreshBookWorkGraph(root);
  const reasons: string[] = [];
  if (run.workGraphFingerprint !== graph.fingerprint) reasons.push("WORK_GRAPH_STALE");
  if (graph.workItems.some((item) => item.status !== "completed")) reasons.push("SCOPE_WORK_INCOMPLETE");
  const milestoneAudits = await auditMilestoneRepairsForRun({ root, projectSlug: run.projectSlug, bookRunId, sourceFingerprint });
  if (milestoneAudits.issues.length) reasons.push("MILESTONE_AUDIT_REQUIRED");
  const quiescence = await readQuiescenceProof(root, bookRunId, run.version);
  if (!quiescence) reasons.push("QUIESCENCE_PROOF_REQUIRED");
  const evidence: BookRunClosureReadiness["evidence"] = { workGraphFingerprint: graph.fingerprint, ...(quiescence ? { quiescenceProofFingerprint: quiescence.fingerprint } : {}) };
  try {
    const closure = await assertClosureCertificateCurrent(root, sourceFingerprint);
    evidence.closureCertificateFingerprint = closure.certificate.fingerprint;
  } catch { reasons.push("CLOSURE_CERTIFICATE_REQUIRED"); }
  return { state: reasons.length ? "closure_blocked" : "closure_ready", bookRunId, runVersion: run.version, reasons, evidence };
}
