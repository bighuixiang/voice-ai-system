import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CreativeSessionPanel from "./CreativeSessionPanel.vue";

describe("CreativeSessionPanel", () => {
  it("shows the main author input and captured messages", () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: {
          schemaVersion: "creative-session.v1",
          projectId: "demo",
          messages: [
            {
              id: "m1",
              clientMessageId: "c1",
              role: "author",
              sourceKind: "author",
              text: "A storm arrives at the city gate.",
              createdAt: "2026-07-29T00:00:00.000Z"
            }
          ],
          updatedAt: "2026-07-29T00:00:00.000Z"
        }
      }
    });

    expect(wrapper.get('[data-testid="creative-session-panel"]')).toBeTruthy();
    expect(wrapper.get('textarea[aria-label="作者输入"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("A storm arrives at the city gate.");
  });

  it("emits a trimmed message when submitted", async () => {
    const wrapper = mount(CreativeSessionPanel, { props: { session: null } });
    await wrapper.get("textarea").setValue("  Keep the mysterious letter.  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toEqual([["Keep the mysterious letter."]]);
  });

  it("keeps the low-input author field writable while the session hydrates", async () => {
    const wrapper = mount(CreativeSessionPanel, { props: { session: null, loading: true } });
    const input = wrapper.get('textarea[aria-label="作者输入"]');

    expect((input.element as HTMLTextAreaElement).disabled).toBe(false);
    await input.setValue("A short idea while the workspace is loading.");
    expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers an explicit T0 freeze action without changing the preview", async () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: {
          schemaVersion: "creative-session.v1",
          projectId: "demo",
          messages: [{ id: "m1", clientMessageId: "c1", role: "author", sourceKind: "author", text: "A seed", createdAt: "now" }],
          updatedAt: "now"
        },
        preview: {
          schemaVersion: "understanding-preview.v1",
          projectSlug: "demo",
          inputFingerprint: "a".repeat(64),
          sourceMessageIds: ["m1"],
          coreExplicit: [],
          inferred: [],
          unknowns: [],
          nextAction: "await-safe-understanding-dependencies",
          modelCallIssued: false,
          canonWritten: false
        }
      }
    });

    await wrapper.get(".freeze-button").trigger("click");
    expect(wrapper.emitted("freeze")).toEqual([[]]);
  });

  it("shows the server-authoritative primary journey action", () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        journey: {
          schemaVersion: "creative-journey-projection.v1",
          projectSlug: "demo",
          stage: "understanding",
          primaryAsset: "understanding-preview",
          primaryAction: { id: "review-understanding", label: "确认原始输入并生成问题", kind: "review", status: "available" },
          activeQuestion: { id: "question-primary-desire", text: "What must the protagonist want most?", status: "candidate", impact: "high", source: "deterministic-gap" },
          sourceMessageIds: ["m1"],
          sessionFingerprint: "a".repeat(64)
        }
      }
    });

    expect(wrapper.get('[data-testid="journey-primary-action"]').text()).toContain("确认原始输入并生成问题");
    expect(wrapper.get('.journey-stage').text()).toBe("理解");
  });

  it("emits the primary journey action when the author activates it", async () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        journey: {
          schemaVersion: "creative-journey-projection.v1",
          projectSlug: "demo",
          stage: "understanding",
          primaryAsset: "understanding-preview",
          primaryAction: { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
          sourceMessageIds: [],
          sessionFingerprint: "a".repeat(64)
        }
      }
    });

    await wrapper.get('[data-testid="journey-primary-action"] button').trigger("click");

    expect(wrapper.emitted("primary-action")).toEqual([["review-understanding"]]);
  });

  it("does not offer question generation before the author confirms the frozen input", () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        journey: {
          schemaVersion: "creative-journey-projection.v1",
          projectSlug: "demo",
          stage: "understanding",
          primaryAsset: "understanding-preview",
          primaryAction: { id: "review-understanding", label: "Review", kind: "review", status: "available" },
          sourceMessageIds: ["m1"],
          sessionFingerprint: "a".repeat(64)
        }
      }
    });

    expect(wrapper.find('[data-testid="prepare-question"]').exists()).toBe(false);
  });

  it("submits an answer for the active dialogue question", async () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        question: {
          schemaVersion: "dialogue-question.v1",
          questionId: "question-primary-desire",
          questionVersion: 1,
          projectSlug: "demo",
          status: "active",
          text: "What must the protagonist want most?",
          whyNow: "The contract depends on this.",
          impact: "high",
          ambiguity: 0.8,
          errorCost: "Wrong opening",
          reversibility: "Reversible",
          delayCost: "Blocks progress",
          options: [],
          recommendation: "Choose a concrete desire.",
          snapshotFingerprint: "b".repeat(64)
        }
      }
    });

    await wrapper.get('[data-testid="dialogue-answer"]').setValue("Find the lost name");
    await wrapper.get('[data-testid="dialogue-answer-form"]').trigger("submit");

    expect(wrapper.emitted("answer")).toEqual([["Find the lost name", "confirmed"]]);
  });

  it("shows the governed red-blue evidence before the author answers", () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        question: {
          schemaVersion: "dialogue-question.v1", questionId: "question-primary-desire", questionVersion: 1, projectSlug: "demo", status: "active", text: "What must the protagonist want most?", whyNow: "The contract depends on this.", impact: "high", ambiguity: 0.8, errorCost: "Wrong opening", reversibility: "Reversible", delayCost: "Blocks progress", options: ["Expose the truth", "Protect the family"], recommendation: "Expose the truth", snapshotFingerprint: "b".repeat(64),
          redBlueCase: { caseId: "red-blue-question-primary-desire-1", status: "open", options: [{ optionId: "a", label: "Expose the truth", claim: "Shared proof", bestCase: "Trust grows", failureModes: ["Too early"], opportunityCost: "Privacy", reversibility: "low", uncertainty: "high" }, { optionId: "b", label: "Protect the family", claim: "Safety first", bestCase: "Stability", failureModes: ["Truth delayed"], opportunityCost: "Momentum", reversibility: "medium", uncertainty: "medium" }], sharedFacts: ["The opening depends on this."], irreducibleTradeoff: "Truth versus safety.", recommendation: "Expose the truth", recommendationReason: "It best serves the stated promise.", dissent: ["Safety remains viable."], whatWouldChangeRecommendation: ["Author correction"], fingerprint: "c".repeat(64) }
        }
      }
    });
    expect(wrapper.get('[data-testid="red-blue-case"]').text()).toContain("Truth versus safety.");
    expect(wrapper.get('[data-testid="red-blue-case"]').text()).toContain("Expose the truth");
  });

  it("uses a red-blue option as a draft without submitting or adopting it", async () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        question: {
          schemaVersion: "dialogue-question.v1", questionId: "q", questionVersion: 1, projectSlug: "demo", status: "active", text: "Choose", whyNow: "Now", impact: "high", ambiguity: 0.8, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["A", "B"], recommendation: "A", snapshotFingerprint: "f".repeat(64),
          redBlueCase: { caseId: "case", status: "open", options: [{ optionId: "a", label: "A", claim: "claim", bestCase: "best", failureModes: ["risk"], opportunityCost: "cost", reversibility: "low", uncertainty: "high" }, { optionId: "b", label: "B", claim: "claim", bestCase: "best", failureModes: ["risk"], opportunityCost: "cost", reversibility: "medium", uncertainty: "medium" }], sharedFacts: ["fact"], irreducibleTradeoff: "tradeoff", recommendation: "A", recommendationReason: "reason", dissent: [], whatWouldChangeRecommendation: [], fingerprint: "c".repeat(64) }
        }
      }
    });
    await wrapper.get('[data-testid="red-blue-option-a"]').trigger("click");
    expect(((wrapper.get('[data-testid="dialogue-answer"]') as any).element as HTMLTextAreaElement).value).toBe("A");
    expect(wrapper.emitted("answer")).toBeUndefined();
  });

  it("offers question preparation when understanding has no durable question yet", async () => {
    const wrapper = mount(CreativeSessionPanel, {
      props: {
        session: null,
        journey: {
          schemaVersion: "creative-journey-projection.v1",
          projectSlug: "demo",
          stage: "understanding",
          primaryAsset: "understanding-preview",
          primaryAction: { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
          sourceMessageIds: ["m1"],
          sessionFingerprint: "a".repeat(64)
        },
        contextManifest: { schemaVersion: "context-manifest.v1", manifestId: "manifest-1", projectSlug: "demo", purpose: "understanding", sourceSessionId: "session-1", sourceFingerprint: "a".repeat(64), sourceMessages: [], frozenAt: "now" }
      }
    });

    await wrapper.get('[data-testid="prepare-question"]').trigger("click");

    expect(wrapper.emitted("prepare-question")).toEqual([[]]);
  });

  it("offers retry when contract candidate compilation is blocked", async () => {
    const wrapper = mount(CreativeSessionPanel, { props: { session: null, contractError: "NO_CONTRACT_FIELDS" } });

    expect(wrapper.text()).toContain("NO_CONTRACT_FIELDS");
    await wrapper.get('[data-testid="retry-contract-candidate"]').trigger("click");

    expect(wrapper.emitted("retry-contract")).toEqual([[]]);
  });
});
