import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CharacterContractPanel from "./CharacterContractPanel.vue";
import type { CharacterDramaticContract } from "@/types/novel";

const contract: CharacterDramaticContract = { schemaVersion: "character-dramatic-contract.v1", contractId: "contract-1", projectSlug: "demo", characterId: "hero", displayName: "Hero", externalWant: "escape", internalNeed: "trust", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect"], contradiction: "freedom/control", stake: "team", unacceptableChoice: "betray", potentialChange: "accept help", unknown: ["final loyalty"], sources: [{ field: "falseBelief", provenance: "inference", sourceVersion: "model-1", evidenceRefs: ["inference://1"] }], lifecycle: "candidate", createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "fp" };

describe("CharacterContractPanel", () => {
  it("shows unknown and provenance, and requires explicit confirmation", async () => {
    const wrapper = mount(CharacterContractPanel, { props: { contracts: [contract] } });
    expect(wrapper.text()).toContain("final loyalty");
    expect(wrapper.text()).toContain("inference");
    await wrapper.get(`[data-testid='confirm-character-${contract.contractId}']`).trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([contract]);
  });
  it("emits refresh explicitly", async () => {
    const wrapper = mount(CharacterContractPanel);
    await wrapper.get("[data-testid='refresh-character-contracts']").trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });
});
