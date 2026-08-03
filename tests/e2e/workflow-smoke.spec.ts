import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

type NovelProject = {
  slug: string;
  title?: string;
  chapters?: Array<{ id: string; contentPath: string }>;
};

type NovelTask = {
  type: string;
  status: string;
};

type BackgroundJob = {
  type: string;
  status: string;
};

type ProjectAuditReport = {
  taskSummary: { total: number; byStatus: Record<string, number> };
  backgroundJobSummary: { total: number; byStatus: Record<string, number> };
  knowledgeSummary: { indexedChapterCount: number };
  runtimeSummary: { chapterCount: number };
};

const apiBase = "";

async function createSmokeProject(request: APIRequestContext) {
  const response = await request.post(`${apiBase}/api/novel/projects`, {
    data: {
      title: `Workflow Smoke ${Date.now()}`,
      genre: "workflow-smoke",
      roughIdea: "A short disposable project for validating the save-to-recap workflow."
    }
  });
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { project: NovelProject };
  expect(data.project.slug).toBeTruthy();
  return data.project;
}

async function deleteSmokeProject(request: APIRequestContext, project?: NovelProject) {
  if (!project?.slug) return;
  const response = await request.delete(`${apiBase}/api/novel/projects/${project.slug}`);
  expect(response.ok()).toBeTruthy();
}

async function enableAutoPipeline(page: Page) {
  const toggle = page.locator(".save-pipeline-panel .el-switch").first();
  await expect(toggle).toBeVisible();
  const checked = await toggle.evaluate((element) => element.classList.contains("is-checked"));
  if (!checked) {
    await toggle.click();
  }
}

async function openReviewMode(page: Page) {
  const review = page.locator(".writing-mode-switcher .segment-option").nth(2);
  await expect(review).toBeVisible();
  await review.click();
}

async function expandPanelContaining(page: Page, childSelector: string) {
  const panel = page.locator(childSelector);
  if (await panel.isVisible()) return;
  const collapsible = panel.locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' collapsible-panel ')][1]"
  );
  await expect(collapsible).toHaveCount(1);
  const toggle = collapsible.locator(".panel-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
}

async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function waitForWorkflowArtifacts(request: APIRequestContext, project: NovelProject, chapterId: string) {
  await expect
    .poll(
      async () => {
        const data = await getJson<{ tasks: NovelTask[] }>(request, `${apiBase}/api/novel/projects/${project.slug}/tasks`);
        return data.tasks.some((task) => task.type === "writing.recap" && task.status === "success");
      },
      { timeout: 30_000 }
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const data = await getJson<{ jobs: BackgroundJob[] }>(request, `${apiBase}/api/novel/projects/${project.slug}/jobs`);
        return {
          quality: data.jobs.some((job) => job.type === "quality.series.rebuild" && job.status === "success"),
          knowledge: data.jobs.some((job) => job.type === "knowledge.index.rebuild" && job.status === "success"),
          story: data.jobs.some((job) => job.type === "story.graph.rebuild" && job.status === "success")
        };
      },
      { timeout: 30_000 }
    )
    .toEqual({ quality: true, knowledge: true, story: true });

  const [{ snapshot }, { index }, { report }] = await Promise.all([
    getJson<{ snapshot: { chapterId: string; fingerprint: string } }>(
      request,
      `${apiBase}/api/novel/projects/${project.slug}/runtime/${chapterId}`
    ),
    getJson<{ index: { chapterIndex: { chapters: Array<{ chapterId: string }> } } }>(
      request,
      `${apiBase}/api/novel/projects/${project.slug}/knowledge/index`
    ),
    getJson<{ report: ProjectAuditReport }>(request, `${apiBase}/api/novel/projects/${project.slug}/audit-report`)
  ]);

  expect(snapshot.chapterId).toBe(chapterId);
  expect(snapshot.fingerprint).toBeTruthy();
  expect(index.chapterIndex.chapters.some((chapter) => chapter.chapterId === chapterId)).toBe(true);
  expect(report.taskSummary.byStatus.success || 0).toBeGreaterThanOrEqual(1);
  expect(report.backgroundJobSummary.byStatus.success || 0).toBeGreaterThanOrEqual(3);
  expect(report.knowledgeSummary.indexedChapterCount).toBeGreaterThanOrEqual(1);
  expect(report.runtimeSummary.chapterCount).toBeGreaterThanOrEqual(1);
}

test("author save workflow runs recap, runtime, background rebuilds, and audit preview", async ({ page, request }) => {
  test.setTimeout(90_000);
  let project: NovelProject | undefined;

  try {
    project = await createSmokeProject(request);
    const chapter = project.chapters?.[0];
    expect(chapter?.id).toBeTruthy();

    await page.addInitScript((projectSlug) => {
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
      window.localStorage.setItem("voice-ai-theme", "dark");
      window.localStorage.removeItem(`novel-workspace:${projectSlug}:review:collapsed-panels`);
      window.localStorage.removeItem(`novel-workspace:${projectSlug}:focus:collapsed-panels`);
    }, project.slug);

    await page.goto(`/projects/${project.slug}`);
    await expect(page.locator(".workspace-grid")).toBeVisible();
    await enableAutoPipeline(page);

    const editor = page.locator(".chapter-editor .editor-textarea");
    await expect(editor).toBeVisible();
    const chapterContent = `# ${chapter?.id} Workflow Smoke

The saved chapter adds a verifiable fact for the recap, quality, knowledge, and runtime pipeline.

The protagonist records a clean decision so the mock recap can be accepted later by a real author.`;
    await editor.fill(chapterContent);
    await page.locator(".chapter-editor .save-button").click();

    await expect(page.locator(".save-pipeline-panel .step-item.done")).toHaveCount(3, { timeout: 45_000 });
    await expect(page.locator(".save-pipeline-panel .step-item.queued")).toHaveCount(3, { timeout: 45_000 });
    const creationLoopPanel = page.locator(".autopilot-loop-panel");
    await creationLoopPanel.locator(".panel-toggle").click();
    const creationLoop = page.getByRole("region", { name: "章节创作闭环" });
    await expect(creationLoop).toBeVisible();
    await expect(creationLoop.locator(".risk-radar, .loop-steps").first()).toBeVisible();
    await expect(creationLoop).toContainText(/进行中|后台队列|处理中|质量|索引|图谱|已沉淀/);
    await waitForWorkflowArtifacts(request, project, chapter!.id);

    await openReviewMode(page);
    await expandPanelContaining(page, ".recap-panel");
    await expect(page.locator(".recap-panel")).toBeVisible();

    await expandPanelContaining(page, ".task-history-panel");
    await page.locator(".task-history-panel .report-actions button").first().click();
    await expect(page.locator(".audit-report-panel")).toBeVisible();
    await expect(page.locator(".audit-report-panel .metric-strip")).toBeVisible();
    await expect(page.locator(".audit-report-panel")).toContainText(/Task Health|任务健康/);
  } finally {
    await deleteSmokeProject(request, project);
  }
});
