import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PublicationEvidencePanel from "./PublicationEvidencePanel.vue";

describe("PublicationEvidencePanel", () => {
  it("requires an edition id and emits an explicit evidence read", async () => {
    const wrapper = mount(PublicationEvidencePanel);
    expect((wrapper.get("[data-testid='load-publication-evidence']").element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get("[data-testid='publication-edition-id']").setValue("edition-1");
    await wrapper.get("[data-testid='load-publication-evidence']").trigger("click");
    expect(wrapper.emitted("load")?.[0]).toEqual(["edition-1"]);
  });

  it("shows each evidence layer without implying release activation", () => {
    const wrapper = mount(PublicationEvidencePanel, { props: { manifest: { editionId: "edition-1" } as any, tree: { fingerprint: "tree" } as any, artifacts: { fingerprint: "artifacts" } as any, proof: { valid: true } as any, preflight: { status: "passed" } as any } });
    expect(wrapper.text()).toContain("edition-1");
    expect(wrapper.text()).toContain("valid");
    expect(wrapper.text()).toContain("passed");
    expect(wrapper.text()).not.toContain("已激活");
  });

  it("requires explicit author approval before issuing delivery proof", async () => {
    const wrapper = mount(PublicationEvidencePanel, { props: { manifest: { editionId: "edition-1" } as any, artifacts: { fingerprint: "artifacts" } as any, preflight: { status: "ready" } as any } });
    await wrapper.get("[data-testid='delivery-approval-id']").setValue("approval-1");
    await wrapper.get("[data-testid='issue-delivery-proof']").trigger("click");
    expect(wrapper.emitted("issue-proof")?.[0]).toEqual(["approval-1"]);
  });

  it("exposes explicit frozen-edition and artifact pipeline commands", async () => {
    const wrapper = mount(PublicationEvidencePanel);
    await wrapper.get("[data-testid='canon-commit-fingerprint']").setValue("canon-1");
    await wrapper.get("[data-testid='edition-title']").setValue("Demo");
    await wrapper.get("[data-testid='edition-author']").setValue("Author");
    await wrapper.get("[data-testid='edition-language']").setValue("zh-CN");
    await wrapper.get("[data-testid='create-publication-edition']").trigger("click");
    expect(wrapper.emitted("create")?.[0]).toEqual([{ canonCommitFingerprint: "canon-1", title: "Demo", author: "Author", language: "zh-CN", chapters: [] }]);
    const withManifest = mount(PublicationEvidencePanel, { props: { manifest: { editionId: "edition-1" } as any, tree: null, artifacts: null } });
    await withManifest.get("[data-testid='compile-publication-tree']").trigger("click");
    expect(withManifest.emitted("compile-tree")).toHaveLength(1);
  });
});
