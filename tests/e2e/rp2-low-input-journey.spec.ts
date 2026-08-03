import { expect, test } from "@playwright/test";

const apiBase = `http://127.0.0.1:${process.env.NOVEL_API_PORT || "8787"}`;

test("RP2 low-input slice: idea to answered question and authoritative projection", async ({ page, request }) => {
  test.setTimeout(45_000);
  let slug = "";
  const created = await request.post(`${apiBase}/api/novel/projects`, { data: { title: `RP2 Low Input ${Date.now()}`, roughIdea: "A lighthouse keeper proves a drowned city is alive." } });
  expect(created.ok()).toBeTruthy();
  slug = ((await created.json()) as { project: { slug: string } }).project.slug;
  try {
    await page.goto(`/projects/${slug}`);
    await page.getByLabel("Author input").fill("The keeper must prove the drowned city is alive.");
    await page.getByRole("button", { name: "Capture words" }).click();
    await expect(page.getByTestId("understanding-preview")).toBeVisible();
    await page.getByRole("button", { name: "Freeze exact input for V2" }).click();
    await expect(page.locator(".manifest-state")).toContainText("T0 frozen");

    expect((await (await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/budget`, { data: { reservationId: `e2e-${Date.now()}`, units: 100 } })).json())).toHaveProperty("reservation");
    const authorization = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/capability-authorization`, { data: { profileId: "codex-cli", modelId: "gpt-5-mini" } });
    expect(authorization.ok()).toBeTruthy();

    await page.getByTestId("prepare-question").click();
    await expect(page.getByTestId("dialogue-answer-form")).toBeVisible();
    await page.getByTestId("dialogue-answer").fill("The keeper wants to make shared proof possible.");
    await page.getByTestId("dialogue-answer-form").getByRole("button").click();
    await expect(page.getByTestId("dialogue-answer-form")).toHaveCount(0);

    const questions = (await (await request.get(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions`)).json()) as { questions: Array<{ status: string }> };
    expect(questions.questions).toEqual(expect.arrayContaining([expect.objectContaining({ status: "answered" })]));
    const decisions = (await (await request.get(`${apiBase}/api/novel/projects/${slug}/session/understanding/decisions`)).json()) as { decisions: Array<{ decisionId: string }>; projection: { schemaVersion: string; current: Array<{ decisionId: string }> } };
    expect(decisions.decisions[0]?.decisionId).toBeTruthy();
    expect(decisions.projection).toMatchObject({ schemaVersion: "decision-projection.v1", current: [expect.objectContaining({ decisionId: decisions.decisions[0].decisionId })] });
  } finally {
    const deleted = await request.delete(`${apiBase}/api/novel/projects/${slug}`);
    expect([200, 204, 404]).toContain(deleted.status());
  }
});

test("RP2 recovery: refresh restores the authoritative journey and answered state", async ({ page, request }) => {
  test.setTimeout(45_000);
  let slug = "";
  const created = await request.post(`${apiBase}/api/novel/projects`, {
    data: { title: `RP2 Recovery ${Date.now()}`, roughIdea: "A cartographer hears a signal from a vanished island." }
  });
  expect(created.ok()).toBeTruthy();
  slug = ((await created.json()) as { project: { slug: string } }).project.slug;
  try {
    await page.goto(`/projects/${slug}`);
    const captured = await request.post(`${apiBase}/api/novel/projects/${slug}/session/messages`, {
      data: { clientMessageId: "rp2-recovery-message", text: "The cartographer must prove the island still exists." }
    });
    expect(captured.status()).toBe(201);

    await page.reload();
    await expect(page.getByTestId("journey-primary-action")).toContainText("确认当前理解");
    const frozen = await request.post(`${apiBase}/api/novel/projects/${slug}/session/context-manifest`);
    expect([200, 201]).toContain(frozen.status());
    expect((await (await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/budget`, { data: { reservationId: `recovery-${Date.now()}`, units: 100 } })).json())).toHaveProperty("reservation");
    const authorization = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/capability-authorization`, { data: { profileId: "codex-cli", modelId: "gpt-5-mini" } });
    expect(authorization.ok()).toBeTruthy();
    const understood = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding`, { data: { mode: "shadow" } });
    expect(understood.status()).toBe(201);
    const question = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions`, { data: {} });
    expect(question.status()).toBe(201);
    const questionBody = (await question.json()) as { question: { questionId: string; questionVersion: number; snapshotFingerprint: string } };
    const answered = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions/${questionBody.question.questionId}/answers`, {
      data: { questionVersion: questionBody.question.questionVersion, expectedSnapshotFingerprint: questionBody.question.snapshotFingerprint, idempotencyKey: "rp2-recovery-answer", answerText: "The cartographer wants shared proof, not a private hunch.", answerStatus: "confirmed" }
    });
    expect(answered.status()).toBe(201);

    await page.reload();
    await expect(page.getByTestId("journey-primary-action")).not.toContainText("回答");
    const journey = (await (await request.get(`${apiBase}/api/novel/projects/${slug}/session/journey`)).json()) as {
      journey: { activeQuestion?: { status: string }; primaryAction: { id: string } };
    };
    expect(journey.journey.activeQuestion).toBeUndefined();
    expect(journey.journey.primaryAction.id).toBeTruthy();
  } finally {
    const deleted = await request.delete(`${apiBase}/api/novel/projects/${slug}`);
    expect([200, 204, 404]).toContain(deleted.status());
  }
});
