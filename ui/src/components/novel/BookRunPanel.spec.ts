import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BookRunPanel from "./BookRunPanel.vue";
import type { BookRun } from "@/types/novel";

const run = {
  schemaVersion: "book-run.v1",
  bookRunId: "book-run-1",
  projectSlug: "demo",
  objective: "Continue",
  scope: { chapterIds: ["chapter-001"], scopeFingerprint: "s" },
  workGraphRef: "graph",
  workGraphFingerprint: "g",
  autonomyGrantRef: "grant",
  autonomyLevel: "L1",
  limits: { maxWorkItems: 1 },
  status: "ready",
  currentGate: "none",
  progress: { totalWorkItems: 1, completedWorkItems: 0, queuedWorkItems: 0, denominator: "frozen-work-graph" },
  version: 1,
  startedAt: "now",
  createdAt: "now",
  fingerprint: "f"
} as BookRun;

describe("BookRunPanel", () => {
  it("keeps the book run visibly separate from canon and exposes explicit controls", async () => {
    const wrapper = mount(BookRunPanel, { props: { run } });
    expect(wrapper.text()).toContain("整书工作流");
    expect(wrapper.text()).toContain("ready");
    await wrapper.get("[data-testid='advance-book-run']").trigger("click");
    expect(wrapper.emitted("advance")).toHaveLength(1);
  });

  it("offers start only when no active run exists", async () => {
    const wrapper = mount(BookRunPanel);
    await wrapper.get("[data-testid='start-book-run']").trigger("click");
    expect(wrapper.emitted("start")).toHaveLength(1);
  });

  it("requires an explicit source fingerprint before completion audit", async () => {
    const wrapper = mount(BookRunPanel, { props: { run: { ...run, status: "scope_complete" } } });
    expect(wrapper.get("[data-testid='run-completion-audit']").attributes("disabled")).toBeDefined();
    await wrapper.get("[data-testid='completion-source-fingerprint']").setValue("closure-source-1");
    await wrapper.get("[data-testid='run-completion-audit']").trigger("click");
    expect(wrapper.emitted("completion-audit")?.[0]).toEqual(["closure-source-1"]);
  });
});
