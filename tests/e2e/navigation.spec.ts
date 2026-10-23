import { expect, test } from '@playwright/test';

test('skip-link focus and document fragments preserve the scenario without state errors', async ({
  page,
}) => {
  await page.goto('./#workspace');
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Połącz L', exact: true }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('253');
  const skip = page.getByRole('link', { name: 'Przejdź do narzędzi' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = '#workspace';
  });
  await expect(page).toHaveURL(/#workspace$/);
  await expect(page.getByTestId('camp-L')).toHaveText('253');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('camp-L')).toHaveText('253');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a malformed shared-state hash still displays an actionable error', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    window.location.hash = '#s=!';
  });
  await expect(page.getByRole('alert')).toContainText('Nieprawidłowy link scenariusza');
  await expect(page.getByTestId('camp-L')).toHaveText('228');
});
