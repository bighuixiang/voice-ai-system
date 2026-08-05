import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ContractCandidatePanel from "./ContractCandidatePanel.vue";
import type { ContractAdoptionProposal, StoryContractCandidate } from "@/types/novel";

const candidate: StoryContractCandidate = {
  schemaVersion: "story-contract-candidate.v1",
  candidateId: "candidate-1",
  projectSlug: "demo",
  status: "candidate",
  sourceDecisionId: "decision-1",
  sourceFingerprint: "a".repeat(64),
  fields: [
    {
      fieldId: "field-1",
      path: "conflict.core",
      value: "The order exploits reincarnation.",
      epistemicStatus: "explicit",
      evidenceRefs: [{ kind: "dialogue-question", refId: "question-1" }],
      sourceDecisionId: "decision-1",
      lock: "unlocked"
    }
  ],
  contract: {
    protagonist: { primaryDesire: "Escape", innerNeed: null, misbelief: null },
    conflict: { core: "The order exploits reincarnation.", opposingPressure: null },
    stakes: { failureCost: null, irreversibleChoice: null },
    world: { primaryRule: null },
    readerPromise: "A costly mystery",
    endingDirection: null
  },
  assumptions: ["The order has a hidden motive."],
  impactSummary: ["Changes the antagonist pressure."],
  unknowns: ["What the protagonist will sacrifice."],
  canonWritten: false,
  createdAt: "2026-07-30T00:00:00.000Z",
  fingerprint: "b".repeat(64)
};
const proposal: ContractAdoptionProposal = {
  schemaVersion: "story-contract-adoption-proposal.v1",
  proposalId: "proposal-1",
  candidateId: candidate.candidateId,
  candidateFingerprint: candidate.fingerprint,
  projectSlug: candidate.projectSlug,
  status: "ready_for_authorization",
  fieldDecisions: [{ fieldId: "field-1", status: "accept" }],
  acceptedFields: candidate.fields,
  unresolvedFieldIds: [],
  reviewId: "review-1",
  canonWritten: false,
  createdAt: candidate.createdAt,
  fingerprint: "p".repeat(64)
};

describe("ContractCandidatePanel", () => {
  it("clearly separates candidates from canon and exposes evidence fields", () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate] } });

    expect(wrapper.get("[data-testid='contract-candidate-panel']").text()).toContain("候选，尚未成为正式设定");
    expect(wrapper.text()).toContain("The order exploits reincarnation.");
    expect(wrapper.text()).toContain("question-1");
    expect(wrapper.text()).toContain("What the protagonist will sacrifice.");
  });

  it("emits refresh and selection actions", async () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate] } });
    await wrapper.get("button[aria-label='刷新故事契约候选']").trigger("click");
    await wrapper.get("button[aria-label='查看候选 candidate-1']").trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("select")?.[0]).toEqual([candidate]);
  });

  it("creates an explicit per-field adoption decision set", async () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate] } });
    await wrapper.get("button[aria-label='查看候选 candidate-1']").trigger("click");
    await wrapper.get("select[aria-label='决定 conflict.core']").setValue("accept");
    await wrapper.get("button[aria-label='生成采纳提案 candidate-1']").trigger("click");

    expect(wrapper.emitted("adopt")?.[0]).toEqual([
      {
        candidateId: "candidate-1",
        expectedCandidateFingerprint: candidate.fingerprint,
        fieldDecisions: [{ fieldId: "field-1", status: "accept" }]
      }
    ]);
  });

  it("exposes the next-stage outline compilation action without adopting canon", async () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate], outlineSourceCandidateId: candidate.candidateId } });
    await wrapper.get("button[aria-label='生成大纲候选 candidate-1']").trigger("click");

    expect(wrapper.emitted("compile-outline")?.[0]).toEqual([{ sourceCandidateId: candidate.candidateId }]);
  });

  it("guides the author to confirm the story blueprint before showing outline generation", () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate] } });

    expect(wrapper.find("button[aria-label='生成大纲候选 candidate-1']").exists()).toBe(false);
    expect(wrapper.text()).toContain("请先确认上方故事蓝图");
  });

  it("disables outline generation while the confirmed blueprint is refreshing", () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate], outlineSourceCandidateId: candidate.candidateId, outlineLoading: true } });

    const button = wrapper.get("button[aria-label='生成大纲候选 candidate-1']");
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    expect(button.text()).toContain("正在同步蓝图");
  });

  it("requires explicit author authorization before committing canon", async () => {
    const wrapper = mount(ContractCandidatePanel, { props: { candidates: [candidate], proposal } });
    await wrapper.get("input[aria-label='授权人']").setValue("author-1");
    await wrapper.get("input[aria-label='授权编号']").setValue("auth-1");
    await wrapper.get("button[aria-label='提交正式设定采纳']").trigger("click");

    expect(wrapper.emitted("commit")?.[0]).toEqual([{ expectedProposalFingerprint: proposal.fingerprint, actorId: "author-1", authorizationId: "auth-1" }]);
  });

  it("shows the completed state and the next outline action after contract adoption", () => {
    const wrapper = mount(ContractCandidatePanel, {
      props: {
        candidates: [{ ...candidate, status: "candidate", canonWritten: true }],
        proposal: { ...proposal, status: "committed", canonWritten: true }
      }
    });

    expect(wrapper.text()).toContain("故事设定已采纳");
    expect(wrapper.text()).toContain("下一步：回到大纲候选，选择并验证章节结构");
    expect(wrapper.text()).not.toContain("ready_for_authorization");
  });
});
