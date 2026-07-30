import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

type NovelProject = {
  slug: string;
  title?: string;
  chapters?: Array<{ id?: string; contentPath?: string }>;
};

function isWhiteBackground(value: string) {
  return value === "rgb(255, 255, 255)" || value === "rgba(255, 255, 255, 1)";
}

async function pickProject(request: APIRequestContext, apiBase: string) {
  const response = await request.get(`${apiBase}/api/novel/projects`);
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { projects: NovelProject[] };
  const project = data.projects
    .filter((item) => item.slug)
    .sort((left, right) => (right.chapters?.length || 0) - (left.chapters?.length || 0))[0];

  expect(project?.slug).toBeTruthy();
  return project;
}

async function expectNonWhiteBackground(selector: string, page: Page) {
  const background = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(isWhiteBackground(background)).toBe(false);
}

test("loads runtime workspace panels and dark themed previews", async ({ page, request }) => {
  const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8787";
  const project = await pickProject(request, apiBase);
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource: the server responded with a status of 404")) {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript((projectSlug) => {
    window.localStorage.setItem("voice-ai-theme", "dark");
    window.localStorage.removeItem(`novel-workspace:${projectSlug}:review:collapsed-panels`);
  }, project.slug);

  await page.goto("/");
  await expect(page.locator(".novel-workspace")).toBeVisible();
  await expect(page.locator(".project-hub")).toBeVisible();

  await page.goto(`/projects/${project.slug}`);
  await expect(page.locator(".workspace-grid")).toBeVisible();
  await expect(page.locator(".center-stage")).toBeVisible();
  await expect(page.locator(".save-pipeline-panel")).toBeVisible();
  await expectNonWhiteBackground(".save-pipeline-panel", page);

  await page.locator(".header-actions button").nth(1).click();
  await expect(page.locator(".ai-config-panel")).toBeVisible();
  await expect(page.locator(".embedding-config")).toBeVisible();
  await expectNonWhiteBackground(".ai-config-panel", page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ai-config-panel")).toBeHidden();

  await page.locator(".header-actions button").nth(2).click();
  await expect(page.locator(".background-job-panel")).toBeVisible();
  await expectNonWhiteBackground(".background-job-panel", page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".background-job-panel")).toBeHidden();

  await page.locator(".writing-mode-switcher .segment-option").nth(2).click();
  const taskHistoryPanel = page.locator(".task-history-panel");
  if (!(await taskHistoryPanel.isVisible())) {
    const collapsible = taskHistoryPanel.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' collapsible-panel ')][1]"
    );
    const toggle = collapsible.locator(".panel-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
  }
  await expect(taskHistoryPanel).toBeVisible();
  await page.locator(".task-history-panel .report-actions button").first().click();
  await expect(page.locator(".audit-report-panel")).toBeVisible();
  await expect(page.locator(".audit-report-panel .metric-strip")).toBeVisible();
  await expectNonWhiteBackground(".audit-report-panel .metric-strip > div", page);

  expect(consoleErrors).toEqual([]);
});
