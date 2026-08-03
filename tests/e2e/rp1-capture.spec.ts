import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

type NovelProject = { slug: string; chapters?: Array<{ id: string }> };

const apiBase = "";

async function createProject(request: APIRequestContext): Promise<NovelProject> {
  const response = await request.post(`${apiBase}/api/novel/projects`, {
    data: { title: `RP1 Capture ${Date.now()}`, roughIdea: "Browser recovery fixture." }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).project as NovelProject;
}

async function deleteProject(request: APIRequestContext, project?: NovelProject) {
  if (!project) return;
  const response = await request.delete(`${apiBase}/api/novel/projects/${project.slug}`);
  expect(response.ok()).toBeTruthy();
}

test("RP1 browser context preserves an author utterance across reload", async ({ page, request }) => {
  let project: NovelProject | undefined;
  try {
    project = await createProject(request);
    await page.goto(`/projects/${project.slug}`);
    await expect(page.locator(".workspace-grid")).toBeVisible();

    const input = page.locator('[data-testid="creative-session-panel"] textarea[aria-label="Author input"]');
    await expect(input).toBeVisible();
    await input.fill("A lighthouse keeper discovers a city beneath the tide.");
    await page.locator('[data-testid="creative-session-panel"] button[type="submit"]').click();
    await expect(page.locator('[data-testid="creative-session-panel"]')).toContainText(
      "A lighthouse keeper discovers a city beneath the tide."
    );
    await expect(page.locator('[data-testid="understanding-preview"]')).toContainText(
      "A lighthouse keeper discovers a city beneath the tide."
    );
    await page.locator('[data-testid="understanding-preview"] .freeze-button').click();
    await expect(page.locator('[data-testid="understanding-preview"]')).toContainText("T0 frozen:");
    const preflight = await page.evaluate(async (slug) => {
      const response = await fetch(`/api/novel/projects/${slug}/session/understanding/preflight`, { method: "POST" });
      return { status: response.status, body: await response.json() };
    }, project.slug);
    expect(preflight.status).toBe(200);
    expect(preflight.body.preflight).toMatchObject({ status: "block", modelCallAllowed: false });

    await page.reload();
    await expect(page.locator(".workspace-grid")).toBeVisible();
    await expect(page.locator('[data-testid="creative-session-panel"]')).toContainText(
      "A lighthouse keeper discovers a city beneath the tide."
    );
    await expect(page.locator('[data-testid="understanding-preview"]')).toContainText(
      "A lighthouse keeper discovers a city beneath the tide."
    );
    await expect(page.locator('[data-testid="understanding-preview"]')).toContainText("T0 frozen:");
    const restored = await page.evaluate(async (slug) => {
      const response = await fetch(`/api/novel/projects/${slug}/session`);
      return response.json();
    }, project.slug);

    expect(restored.session.messages).toEqual([
      expect.objectContaining({
        role: "author",
        text: "A lighthouse keeper discovers a city beneath the tide."
      })
    ]);
  } finally {
    await deleteProject(request, project);
  }
});
