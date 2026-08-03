export function evaluateVolumeContract(input: { promiseAnswered: boolean; characterChoice: boolean; costPaid: boolean; authorizedOpenSubquestion: boolean; newOrganizationNameOnly: boolean }): { status: "fulfilled" | "blocked"; mainPromiseFulfilled: boolean; subquestionRetained: boolean } {
  const fulfilled = input.promiseAnswered && input.characterChoice && input.costPaid && !input.newOrganizationNameOnly;
  return { status: fulfilled ? "fulfilled" : "blocked", mainPromiseFulfilled: fulfilled, subquestionRetained: input.authorizedOpenSubquestion };
}

export function reviewChapterFunction(input: { informationChange: boolean; relationshipChange: boolean; resourceChange: boolean; emotionChange: boolean; choiceChange: boolean; readerPayoff: boolean; wordCountMet: boolean }): { status: "functional" | "structure_review"; candidates: Array<"merge" | "delete" | "add_irreversible_choice"> } {
  const stateChange = input.informationChange || input.relationshipChange || input.resourceChange || input.emotionChange || input.choiceChange || input.readerPayoff;
  return stateChange ? { status: "functional", candidates: [] } : { status: "structure_review", candidates: ["merge", "delete", "add_irreversible_choice"] };
}

export function locateSceneSeam(input: { scenes: Array<{ id: string; exitChoice: string; entryState: string; nextTrigger: string }>; transitions: Array<{ from: string; to: string; trigger: string }> }): { status: "connected" | "seam"; gaps: string[]; repairs: Array<"add_choice" | "add_consequence" | "reorder"> } {
  const gaps: string[] = [];
  for (let i = 0; i < input.scenes.length - 1; i += 1) {
    const from = input.scenes[i]; const to = input.scenes[i + 1]; const edge = input.transitions.find((transition) => transition.from === from.id && transition.to === to.id);
    if (!edge || !from.exitChoice || edge.trigger !== from.exitChoice || !to.entryState) gaps.push(`${from.id}->${to.id}`);
  }
  return gaps.length ? { status: "seam", gaps, repairs: ["add_choice", "add_consequence", "reorder"] } : { status: "connected", gaps: [], repairs: [] };
}

export function evaluateCrossLayerOrphans(input: { engineRefs: readonly string[]; arcRefs: readonly string[]; milestoneRefs: readonly string[]; chapterFunctionRefs: readonly string[]; obligationRefs: readonly string[]; promisePlanRefs: readonly string[] }): { status: "execution_ready" | "blocked"; bodyOrphans: string[]; promiseOrphans: string[] } {
  const bodyOrphans = input.engineRefs.length && input.arcRefs.length && input.milestoneRefs.length && input.chapterFunctionRefs.length && input.obligationRefs.length ? [] : ["body_orphan"];
  const promiseOrphans = input.promisePlanRefs.length ? [] : ["promise_orphan"];
  return { status: bodyOrphans.length || promiseOrphans.length ? "blocked" : "execution_ready", bodyOrphans, promiseOrphans };
}
