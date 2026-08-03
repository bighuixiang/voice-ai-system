import crypto from "node:crypto";

export type NarrativeDistance = "first-person" | "close-third" | "limited-third" | "omniscient";
export type PovClaimKind = "observed" | "pov-belief" | "inference" | "secret" | "other-mind" | "omniscient";
export interface PovViolation { code: string; claim: string; repair: string; }
export interface PovKnowledgeGateResult { schemaVersion: "pov-knowledge-gate.v1"; gateId: string; sceneId: string; povCharacterId: string; narrativeDistance: NarrativeDistance; status: "passed" | "blocked"; violations: PovViolation[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluatePovKnowledgeGate(input: { gateId: string; sceneId: string; povCharacterId: string; narrativeDistance: NarrativeDistance; knownFacts: readonly string[]; unknownFacts: readonly string[]; misbeliefs: readonly string[]; prohibitedDisclosure?: readonly string[]; claims: readonly { text: string; kind: PovClaimKind; evidenceRefs: readonly string[] }[]; sourceRefs: readonly string[] }): PovKnowledgeGateResult {
  if (!input.gateId.trim() || !input.sceneId.trim() || !input.povCharacterId.trim()) throw new Error("POV_GATE_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("POV_GATE_SOURCE_REQUIRED");
  const violations: PovViolation[] = [];
  for (const claim of input.claims) {
    if (!claim.text.trim()) violations.push({ code: "POV_EMPTY_CLAIM", claim: claim.text, repair: "Provide observable prose or remove the claim." });
    if (!claim.evidenceRefs.length || claim.evidenceRefs.some((ref) => !ref.trim())) violations.push({ code: "POV_CLAIM_EVIDENCE_REQUIRED", claim: claim.text, repair: "Attach a visible source anchor for the claim or rewrite it as uncertainty." });
    if (claim.kind === "omniscient" && input.narrativeDistance !== "omniscient") violations.push({ code: "POV_DISTANCE_JUMP", claim: claim.text, repair: "Keep omniscient knowledge out of a limited narrative distance or change the declared distance." });
    const leaked = (input.prohibitedDisclosure || []).find((term) => term.trim() && claim.text.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    if (leaked && input.narrativeDistance !== "omniscient") violations.push({ code: "POV_AUTHOR_TRUTH_LEAK", claim: claim.text, repair: `Remove author-only fact '${leaked}' or rewrite it as an observable inference.` });
    if ((claim.kind === "secret" || claim.kind === "other-mind" || claim.kind === "omniscient") && !claim.evidenceRefs.length) {
      const code = claim.kind === "secret" ? "POV_SECRET_UNEARNED" : claim.kind === "other-mind" ? "POV_OTHER_MIND_UNEARNED" : "POV_DISTANCE_JUMP";
      const repair = claim.kind === "secret" ? "Convert to uncertainty or add an earned reveal anchor." : claim.kind === "other-mind" ? "Show the other character through observable behavior." : "Keep the claim within the declared narrative distance.";
      violations.push({ code, claim: claim.text, repair });
    }
  }
  const base = { schemaVersion: "pov-knowledge-gate.v1" as const, gateId: input.gateId, sceneId: input.sceneId, povCharacterId: input.povCharacterId, narrativeDistance: input.narrativeDistance, status: violations.length ? "blocked" as const : "passed" as const, violations };
  return { ...base, fingerprint: hash(base) };
}
