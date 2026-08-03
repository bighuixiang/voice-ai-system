import { expect, test } from "@playwright/test";

test.describe("responsive and keyboard accessibility smoke", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps the project hub usable on a mobile viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".novel-workspace")).toBeVisible();
    await expect(page.locator(".project-hub")).toBeVisible();
    const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(viewportFits).toBe(true);

    const hub = page.locator(".project-hub");
    const box = await hub.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });

  test("exposes primary controls through keyboard and ARIA semantics", async ({ page }) => {
    await page.goto("/");
    const buttons = page.getByRole("button");
    await expect(buttons.first()).toBeVisible();
    await buttons.first().focus();
    await expect(buttons.first()).toBeFocused();
    await expect(buttons.first()).toHaveAttribute("aria-label", /.+/);

    const switches = page.getByRole("switch");
    if (await switches.count()) {
      await expect(switches.first()).toHaveAttribute("aria-checked", /^(true|false)$/);
    }
  });
});
