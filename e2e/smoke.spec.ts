import { expect, test } from "@playwright/test";

/**
 * Дымовые e2e: без логина проверяем публичный экран входа.
 * Полные сценарии с auth — в docs/functional-tests.md (нужен стенд + учётка).
 */
test.describe("smoke", () => {
  test("страница входа открывается", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /вход в систему/i })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /войти/i })).toBeVisible();
  });

  test("редирект с корня на вход или объекты", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/(login|objects)/);
    expect(page.url()).toMatch(/\/(login|objects)/);
  });

  test("неверный логин показывает ошибку", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("nobody@example.com");
    await page.locator("#password").fill("wrong-password-123");
    await page.getByRole("button", { name: /войти/i }).click();
    // toast sonner / сетевая ошибка, если supabase не поднят
    await expect(
      page.getByText(/неверный email или пароль|нет связи с сервером|invalid|failed/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
