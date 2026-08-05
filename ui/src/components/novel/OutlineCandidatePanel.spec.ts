import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OutlineCandidatePanel from "./OutlineCandidatePanel.vue";
import type { OutlineAdoptionProposal, OutlineCandidate, OutlineValidationReport } from "@/types/novel";

const outline: OutlineCandidate = {
  schemaVersion: "outline-candidate.v1",
  outlineId: "outline-1",
  projectSlug: "demo",
  status: "candidate",
  sourceCandidateId: "contract-1",
  sourceCandidateFingerprint: "c".repeat(64),
  horizon: { strongFreezeCount: 3, totalChapterCount: 3 },
  chapters: [
    { chapterId: "chapter-001", order: 1, title: "The pressure", function: "inciting-pressure", goal: "Escape", conflict: "The order exploits reincarnation.", turningPoint: "The seal opens", causalInputs: ["contract"], causalOutputs: ["chapter-001 outcome"], freeze: "strong", status: "candidate" }
  ],
  assumptions: ["The seal can be opened."],
  unknowns: ["The price of escape."],
  canonWritten: false,
  createdAt: "2026-07-30T00:00:00.000Z",
  fingerprint: "o".repeat(64)
};
const report: OutlineValidationReport = {
  schemaVersion: "outline-validation-report.v1",
  reportId: "report-1",
  projectSlug: "demo",
  outlineId: outline.outlineId,
  outlineFingerprint: outline.fingerprint,
  status: "passed",
  checks: [{ checkId: "causal-chain", status: "passed", detail: "Causal chain is intact." }],
  executionReady: false,
  createdAt: outline.createdAt,
  fingerprint: "r".repeat(64)
};
const proposal: OutlineAdoptionProposal = {
  schemaVersion: "outline-adoption-proposal.v1",
  proposalId: "proposal-1",
  projectSlug: "demo",
  outlineId: outline.outlineId,
  outlineFingerprint: outline.fingerprint,
  validationReportId: report.reportId,
  validationFingerprint: report.fingerprint,
  selectedChapterIds: ["chapter-001"],
  status: "ready_for_authorization",
  canonWritten: false,
  createdAt: outline.createdAt,
  fingerprint: "p".repeat(64)
};

describe("OutlineCandidatePanel", () => {
  it("separates outline candidates from canon and shows validation state", () => {
    const wrapper = mount(OutlineCandidatePanel, { props: { candidates: [outline], reports: { [outline.outlineId]: report } } });
    expect(wrapper.text()).toContain("候选，尚未成为正式设定");
    expect(wrapper.text()).toContain("The pressure");
    expect(wrapper.text()).toContain("因果链");
    expect(wrapper.text()).toContain("验证通过，但尚未执行就绪");
  });

  it("emits validation and chapter selection actions", async () => {
    const wrapper = mount(OutlineCandidatePanel, { props: { candidates: [outline], reports: {} } });
    await wrapper.get("button[aria-label='验证大纲 outline-1']").trigger("click");
    await wrapper.get("input[aria-label='选择 chapter-001']").setValue(true);
    await wrapper.get(".selection-button").trigger("click");
    expect(wrapper.emitted("validate")?.[0]).toEqual([outline]);
    expect(wrapper.emitted("select-chapters")?.[0]).toEqual([{ outline, chapterIds: ["chapter-001"] }]);
  });

  it("exposes explicit outline adoption and authorization actions", async () => {
    const wrapper = mount(OutlineCandidatePanel, { props: { candidates: [outline], reports: { [outline.outlineId]: report }, proposal, adoptedContractCandidateId: outline.sourceCandidateId } });
    await wrapper.get("input[aria-label='授权人']").setValue("author-1");
    await wrapper.get("input[aria-label='授权编号']").setValue("outline-auth-1");
    await wrapper.get("button[aria-label='授权大纲采纳']").trigger("click");
    expect(wrapper.emitted("authorize")?.[0]).toEqual([{ expectedProposalFingerprint: proposal.fingerprint, actorId: "author-1", authorizationId: "outline-auth-1" }]);
  });

  it("blocks outline adoption controls until the source contract is canon", () => {
    const wrapper = mount(OutlineCandidatePanel, { props: { candidates: [outline], reports: { [outline.outlineId]: report }, proposal, adoptedContractCandidateId: "" } });

    expect(wrapper.get("[data-testid='outline-contract-prerequisite']").text()).toContain("当前大纲对应的故事设定尚未采纳");
    expect(wrapper.text()).toContain("The pressure");
    expect(wrapper.get(".candidate-heading button").exists()).toBe(true);
    expect((wrapper.get(".authorization-form button").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps outline adoption disabled when the adopted contract belongs to another candidate", async () => {
    const wrapper = mount(OutlineCandidatePanel, { props: { candidates: [outline], reports: { [outline.outlineId]: report }, proposal, adoptedContractCandidateId: "contract-other" } });

    const [actorInput, authorizationInput] = wrapper.findAll(".authorization-form input");
    await actorInput.setValue("author-1");
    await authorizationInput.setValue("outline-auth-1");
    expect((wrapper.get(".authorization-form button").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains the prerequisite on each outline whose source contract was not adopted", () => {
    const otherOutline: OutlineCandidate = { ...outline, outlineId: "outline-2", sourceCandidateId: "contract-2" };
    const wrapper = mount(OutlineCandidatePanel, {
      props: {
        candidates: [outline, otherOutline],
        reports: {},
        adoptedContractCandidateId: outline.sourceCandidateId
      }
    });

    expect(wrapper.findAll(".candidate-card")[1].text()).toContain("请先确认并采纳此大纲对应的故事设定");
  });

  it("shows the completed state and the next execution-readiness action after outline adoption", () => {
    const wrapper = mount(OutlineCandidatePanel, {
      props: {
        candidates: [outline],
        reports: { [outline.outlineId]: { ...report, executionReady: true } },
        proposal: { ...proposal, status: "committed", canonWritten: true },
        adoptedContractCandidateId: outline.sourceCandidateId
      }
    });

    expect(wrapper.text()).toContain("大纲已采纳");
    expect(wrapper.text()).toContain("下一步：检查执行就绪状态，然后开始章节执行");
    expect(wrapper.text()).not.toContain("ready_for_authorization");
  });
});
