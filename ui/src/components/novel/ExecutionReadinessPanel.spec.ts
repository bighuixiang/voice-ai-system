import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ExecutionReadinessPanel from "./ExecutionReadinessPanel.vue";
import type { ExecutionReadinessDecision, ExecutionReadyProof } from "@/types/novel";

const proof: ExecutionReadyProof = { schemaVersion: "execution-ready-proof.v1", proofId: "proof-1", projectSlug: "demo", versionId: "version-1", versionFingerprint: "v".repeat(64), status: "ready", executionReady: true, checks: [{ checkId: "proof-current", status: "passed", detail: "Proof is current." }], createdAt: "2026-07-30T00:00:00.000Z", fingerprint: "p".repeat(64) };
const readiness: ExecutionReadinessDecision = { allowed: true, proof, checks: [{ checkId: "chapter-in-window", status: "passed", detail: "Chapter is in the window." }] };

describe("ExecutionReadinessPanel", () => {
  it("shows proof status separately from chapter execution permission", () => {
    const wrapper = mount(ExecutionReadinessPanel, { props: { proof, readiness, chapterId: "chapter-001" } });
    expect(wrapper.text()).toContain("执行就绪证明");
    expect(wrapper.text()).toContain("证明 ready");
    expect(wrapper.text()).toContain("允许执行");
    expect(wrapper.text()).toContain("chapter-in-window");
  });

  it("emits proof refresh and chapter readiness checks", async () => {
    const wrapper = mount(ExecutionReadinessPanel, { props: { proof: null, readiness: null, chapterId: "chapter-002" } });
    await wrapper.get("button[aria-label='刷新执行证明']").trigger("click");
    await wrapper.get("button[aria-label='检查 chapter-002 执行门禁']").trigger("click");
    expect(wrapper.emitted("refresh-proof")).toHaveLength(1);
    expect(wrapper.emitted("check-readiness")?.[0]).toEqual(["chapter-002"]);
  });

  it("offers chapter production only after the readiness decision allows it", async () => {
    const wrapper = mount(ExecutionReadinessPanel, { props: { proof, readiness, chapterId: "chapter-001" } });
    await wrapper.get("[data-testid='start-chapter-production']").trigger("click");
    expect(wrapper.emitted("start-production")?.[0]).toEqual(["chapter-001"]);
  });
});
