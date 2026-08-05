import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MemoryGovernancePanel from "./MemoryGovernancePanel.vue";

describe("MemoryGovernancePanel", () => {
  it("shows persisted health, continuity and ready-proof evidence", async () => {
    const wrapper = mount(MemoryGovernancePanel, {
      props: {
        health: { reportId: "health-1", status: "degraded", risks: ["chapter-coverage"], coverage: { totalChapters: 4, settledChapters: 3, eligibleClaims: 5, candidateClaims: 1, entityCount: 3, timeBoundClaims: 2, characterKnowledgeEntries: 6, readerKnowledgeEntries: 4 } },
        readyProof: { proofId: "proof-1", status: "blocked", blockers: ["MEMORY_HEALTH_DEGRADED"] },
        continuityAudit: { auditId: "audit-1", status: "blocked", issues: ["CONTRADICTION_SETS_OPEN"] },
        retrievalAvailable: true,
        loading: false
      }
    });

    expect(wrapper.text()).toContain("降级");
    expect(wrapper.text()).toContain("实体 3");
    expect(wrapper.text()).toContain("记忆健康度不足");
    expect(wrapper.text()).toContain("存在未关闭的矛盾集合");
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("run")).toHaveLength(1);
  });

  it("explains why a proof cannot run without a retrieval preview", () => {
    const wrapper = mount(MemoryGovernancePanel, { props: { retrievalAvailable: false, loading: false } });
    expect(wrapper.text()).toContain("检索预览");
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
