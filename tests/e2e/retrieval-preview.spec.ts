import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

type Project = { slug: string; chapters?: Array<{ id: string }> };

async function createProject(request: APIRequestContext): Promise<Project> {
  const response = await request.post("/api/novel/projects", {
    data: { title: `Retrieval Preview ${Date.now()}`, genre: "e2e", roughIdea: "A gate remembers a promise." }
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { project: Project }).project;
}

async function seedKnowledge(request: APIRequestContext, project: Project) {
  const chapterId = project.chapters?.[0]?.id || "chapter-001";
  const summary = {
    chapterId,
    summary: "The sealed gate remembers the promise.",
    keyEvents: [],
    newFacts: [{ id: "fact-preview-gate", chapterId, fact: "The sealed gate remembers the promise.", relatedEntities: ["gate"], status: "accepted", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" }],
    characterStateChanges: [],
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    acceptedRecapIds: [],
    updatedAt: "2026-06-11T00:00:00.000Z"
  };
  const saved = await request.put(`/api/novel/projects/${project.slug}/memory/chapter-summaries/${chapterId}`, { data: { summary } });
  expect(saved.ok()).toBeTruthy();
  const rebuilt = await request.post(`/api/novel/projects/${project.slug}/knowledge/index/rebuild`, { data: {} });
  expect(rebuilt.ok()).toBeTruthy();
}

test("restores the saved retrieval preview after page refresh", async ({ page, request }) => {
  const project = await createProject(request);
  try {
    await seedKnowledge(request, project);
    await page.goto(`/projects/${project.slug}`);
    await expect(page.locator(".workspace-grid")).toBeVisible();
    await page.locator(".header-actions button").nth(2).click();
    await expect(page.locator(".story-control-dialog-body")).toBeVisible();
    const panel = page.locator(".knowledge-index-panel");
    await expect(panel).toBeVisible();
    await panel.locator("input[aria-label]").fill("gate promise");
    await panel.locator("form").press("Enter");
    await expect(panel.locator(".retrieval-audit")).toContainText("Retrieval audit");
    await expect(panel.locator(".retrieval-audit")).toContainText("saved preview retrieval-");
    const previewText = await panel.locator(".retrieval-audit").innerText();

    const governance = page.locator(".memory-governance-panel");
    await expect(governance).toBeVisible();
    await governance.locator("button").click();
    await expect(governance).toContainText("Health");
    await expect(governance).toContainText("Ready proof");
    await expect(governance).toContainText("Continuity audit");

    await page.reload();
    await expect(page.locator(".workspace-grid")).toBeVisible();
    await page.locator(".header-actions button").nth(2).click();
    await expect(page.locator(".story-control-dialog-body")).toBeVisible();
    const reloadedPanel = page.locator(".knowledge-index-panel");
    await expect(reloadedPanel.locator(".retrieval-audit")).toContainText("saved preview retrieval-");
    expect(await reloadedPanel.locator(".retrieval-audit").innerText()).toContain(previewText.match(/saved preview retrieval-[a-f0-9]+/)?.[0] || "saved preview retrieval-");
    const reloadedGovernance = page.locator(".memory-governance-panel");
    await expect(reloadedGovernance).toContainText("Health");
    await expect(reloadedGovernance).toContainText("Ready proof");
    await expect(reloadedGovernance).toContainText("Continuity audit");
  } finally {
    await request.delete(`/api/novel/projects/${project.slug}`);
  }
});
