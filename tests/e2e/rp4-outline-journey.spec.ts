import { expect, test } from "@playwright/test";

const apiBase = "";

test("RP4 outline slice: low-input capture reaches a blocked near-horizon candidate", async ({ page, request }) => {
  test.setTimeout(45_000);
  let slug = "";
  try {
    const created = await request.post(`${apiBase}/api/novel/projects`, {
      data: {
        title: `RP4 Outline ${Date.now()}`,
        genre: "outline-slice",
        roughIdea: "A lighthouse keeper wants to prove the drowned city is alive."
      }
    });
    expect(created.ok()).toBeTruthy();
    slug = ((await created.json()) as { project: { slug: string } }).project.slug;

    await page.goto(`/projects/${slug}`);
    await page.getByLabel("Author input").fill("A lighthouse keeper wants to prove the drowned city is alive.");
    await page.getByRole("button", { name: "Capture words" }).click();
    await expect(page.locator('[data-testid="understanding-preview"]')).toBeVisible();
    await page.getByRole("button", { name: "Freeze exact input for V2" }).click();
    await expect(page.locator(".manifest-state")).toContainText("T0 frozen");

    const budget = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/budget`, {
      data: { reservationId: `rp4-outline-${Date.now()}`, units: 100 }
    });
    expect(budget.ok()).toBeTruthy();
    const authorization = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/capability-authorization`, {
      data: { profileId: "codex-cli", modelId: "gpt-5-mini" }
    });
    expect(authorization.ok()).toBeTruthy();

    const understood = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding`, { data: { mode: "shadow" } });
    expect(understood.ok()).toBeTruthy();
    const manifestResponse = await request.get(`${apiBase}/api/novel/projects/${slug}/session/context-manifest`);
    expect(manifestResponse.ok()).toBeTruthy();
    const sourceFingerprint = ((await manifestResponse.json()) as { manifest: { sourceFingerprint: string } }).manifest.sourceFingerprint;
    const questionResponse = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions`, { data: {} });
    expect(questionResponse.ok()).toBeTruthy();
    const question = ((await questionResponse.json()) as { question: { questionId: string; questionVersion: number } }).question;
    const answered = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions/${question.questionId}/answers`, {
      data: { questionVersion: question.questionVersion, expectedSnapshotFingerprint: sourceFingerprint, idempotencyKey: `rp4-outline-answer-${Date.now()}`, answerText: "The keeper wants proof more than safety.", answerStatus: "confirmed" }
    });
    expect(answered.ok()).toBeTruthy();
    const decision = ((await answered.json()) as { decision: { decisionId: string } }).decision;

    const contractResponse = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-candidates`, {
      data: { decisionId: decision.decisionId }
    });
    expect(contractResponse.ok()).toBeTruthy();
    const contract = ((await contractResponse.json()) as { candidate: { candidateId: string; status: string; canonWritten: boolean } }).candidate;
    expect(contract).toMatchObject({ status: "candidate", canonWritten: false });

    const outlineResponse = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/outline-candidates`, {
      data: { sourceCandidateId: contract.candidateId, strongFreezeCount: 3, totalChapterCount: 3 }
    });
    expect(outlineResponse.status()).toBe(201);
    const outline = ((await outlineResponse.json()) as { outline: { outlineId: string; status: string; canonWritten: boolean; horizon: { strongFreezeCount: number; totalChapterCount: number } } }).outline;
    expect(outline).toMatchObject({ status: "candidate", canonWritten: false, horizon: { strongFreezeCount: 3, totalChapterCount: 3 } });

    const validationResponse = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/outline-candidates/${outline.outlineId}/validate`, { data: {} });
    expect(validationResponse.status()).toBe(201);
    const validation = ((await validationResponse.json()) as { report: { status: string; executionReady: boolean; checks: Array<{ status: string }> } }).report;
    expect(validation).toMatchObject({ status: "blocked", executionReady: false });
    expect(validation.checks.some((check) => check.status === "failed")).toBeTruthy();
  } finally {
    if (slug) {
      const deleted = await request.delete(`${apiBase}/api/novel/projects/${slug}`);
      expect([200, 204, 404]).toContain(deleted.status());
    }
  }
});
