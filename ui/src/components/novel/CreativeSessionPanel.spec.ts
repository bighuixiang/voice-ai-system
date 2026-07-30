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
    expect(wrapper.get('textarea[aria-label="Author input"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("A storm arrives at the city gate.");
  });

  it("emits a trimmed message when submitted", async () => {
    const wrapper = mount(CreativeSessionPanel, { props: { session: null } });
    await wrapper.get("textarea").setValue("  Keep the mysterious letter.  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toEqual([["Keep the mysterious letter."]]);
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
          primaryAction: { id: "review-understanding", label: "确认当前理解", kind: "review", status: "available" },
          activeQuestion: { id: "question-primary-desire", text: "What must the protagonist want most?", status: "candidate", impact: "high", source: "deterministic-gap" },
          sourceMessageIds: ["m1"],
          sessionFingerprint: "a".repeat(64)
        }
      }
    });

    expect(wrapper.get('[data-testid="journey-primary-action"]').text()).toContain("确认当前理解");
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
        }
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
