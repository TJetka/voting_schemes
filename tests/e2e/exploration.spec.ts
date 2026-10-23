import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('exhaustive worker returns all 2385 groupings and opens a reproducible row', async ({
  page,
}) => {
  await page.getByRole('tab', { name: /Wszystkie konfiguracje/ }).click();
  await page.getByRole('button', { name: 'Porównaj wszystkie konfiguracje' }).click();
  await expect(page.getByText(/2.?385 konfiguracji/)).toBeVisible({ timeout: 20_000 });
  const row = page
    .getByRole('table', { name: /Konfiguracje/ })
    .locator('tbody tr')
    .first();
  const campText = await row.locator('td').nth(2).innerText();
  const [left, right, centre] = campText.split(' / ').map(Number);
  expect(left + right + centre).toBe(460);
  await row.getByRole('button', { name: 'Otwórz układ' }).click();
  await expect(page.getByRole('tab', { name: /Koalicje/, exact: false }).first()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const bar = page.locator('.result-bar');
  await expect(bar).toContainText(String(left));
  await expect(bar).toContainText(String(right));
  await expect(
    page.getByRole('status').filter({ hasText: /Otworzono konkretny układ/ }),
  ).toBeVisible();
});

test('a sensitivity threshold transition opens its district at the sampled support', async ({
  page,
}) => {
  await page.getByRole('tab', { name: /Wrażliwość/ }).click();
  await page.getByRole('button', { name: 'Oblicz wrażliwość 1D' }).click();
  await expect(page.getByText(/Dokładne przejście progu krajowego/).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('.transition-districts button').first().click();
  await expect(page.locator('#district-inspector')).toBeVisible();
  await expect(page.locator('#district-inspector')).toContainText('INSPEKTOR OKRĘGU');
});

test('2D grid exposes resolution and rejects overlapping donors', async ({ page }) => {
  await page.getByRole('tab', { name: /Wrażliwość/ }).click();
  await page.getByText('Dwuwymiarowa mapa większości', { exact: true }).click();
  await page.getByRole('button', { name: 'Oblicz mapę 2D' }).click();
  await expect(page.getByText('21 × 21 komórek')).toBeVisible({ timeout: 20_000 });
  const y = page.getByRole('group', { name: 'Oś Y mapy' });
  await y.getByRole('combobox', { name: 'Dawca', exact: true }).selectOption('nl');
  await page.getByRole('button', { name: 'Oblicz mapę 2D' }).click();
  await expect(page.getByRole('alert')).toContainText('rozłączne');
});

test('editing inputs cancels and clears stale exhaustive results', async ({ page }) => {
  await page.getByRole('tab', { name: /Wszystkie konfiguracje/ }).click();
  await page.getByRole('button', { name: 'Porównaj wszystkie konfiguracje' }).click();
  await page.getByLabel('Polityka wspólnych list').selectOption('ordinary');
  await expect(page.locator('.explorer-metrics')).toHaveCount(0);
  await page.getByRole('button', { name: 'Porównaj wszystkie konfiguracje' }).click();
  await expect(page.getByText(/2.?385 konfiguracji/)).toBeVisible({ timeout: 20_000 });
});
