import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const families = ['L', 'R', 'C'] as const;

test('regional default preserves national polls and exposes historical and uniform comparisons', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByTestId('geography-fit')).toHaveText('✓ Średnie krajowe zachowane');
  for (const [family, share] of [
    ['L', '46,45%'],
    ['R', '47,88%'],
    ['C', '5,16%'],
  ] as const) {
    await expect(page.getByTestId(`regional-national-${family}`)).toContainText(`cel: ${share}`);
  }
  await page.getByText('Sprawdź zgodność krajową każdego podmiotu', { exact: true }).click();
  const rows = page.getByRole('table', { name: 'Zgodność poparcia krajowego' }).locator('tbody tr');
  await expect(rows).toHaveCount(11);
  for (const row of await rows.all()) {
    const cells = row.locator('td');
    await expect(cells.nth(2)).toHaveText((await cells.nth(1).textContent())!);
  }
  await page.getByRole('button', { name: '19. Warszawa', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Szczegóły okręgu 19' });
  await expect(inspector.getByTestId('regional-share-L-projected')).toHaveText('64,99%');
  await page.getByText('Geografia i frekwencja', { exact: true }).click();
  const geography = page.getByRole('combobox', { name: 'Rozkład głosów', exact: true });
  await expect(geography).toHaveValue('family');
  await geography.selectOption('historical');
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await expect(page.getByTestId('camp-R')).toHaveText('232');
  await expect(page.getByTestId('geography-fit')).toHaveText('✓ Średnie krajowe zachowane');
  await geography.selectOption('uniform');
  for (const [family, share] of [
    ['L', '46,45%'],
    ['R', '47,88%'],
    ['C', '5,16%'],
  ] as const) {
    await expect(inspector.getByTestId(`regional-share-${family}-projected`)).toHaveText(share);
  }
  await geography.selectOption('family');
  await expect(page.getByTestId('camp-L')).toHaveText('226');
  await expect(inspector.getByTestId('regional-share-L-projected')).toHaveText('64,99%');
});

test('a transfer between different party proxies in one camp leaves every regional camp total fixed', async ({
  page,
}) => {
  await page.goto('./');
  // Include all 41 table rows: this catches changing opponents outside the inspected district.
  await expect(page.locator('.district-section .regional-share-values')).toHaveCount(41 * 3);
  const before = await page.locator('.district-section .regional-share-values').allTextContents();
  expect(before).toHaveLength(41 * 3);
  await page.getByLabel('Zmianę finansują').selectOption('selected');
  await page.getByLabel('Wybrany dawca').selectOption('ko');
  await page.getByLabel('Poparcie Nowa Lewica', { exact: true }).fill('9.77');
  await page.getByLabel('Poparcie Nowa Lewica', { exact: true }).press('Enter');
  await expect(page.getByLabel('Poparcie Koalicja Obywatelska', { exact: true })).toHaveValue(
    '31.54',
  );
  await expect(page.getByTestId('geography-fit')).toHaveText('✓ Średnie krajowe zachowane');
  await expect(page.locator('.district-section .regional-share-values')).toHaveText(before);
  await page.getByText('Sprawdź zgodność krajową każdego podmiotu', { exact: true }).click();
  const table = page.getByRole('table', { name: 'Zgodność poparcia krajowego' });
  const nl = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Nowa Lewica', exact: true }) });
  await expect(nl.locator('td')).toHaveText(['7,77%', '9,77%', '9,77%']);
  await expect(page.locator('.total')).toContainText('100%');
});

test('a version 1.0 saved scenario retains its results until explicit upgrade and shares the new mode', async ({
  page,
  browser,
}) => {
  await page.goto('./');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksport JSON' }).click();
  const file = await download;
  const legacy = JSON.parse(await readFile((await file.path())!, 'utf8')) as {
    modelVersion: string;
    geographyMode: string;
  };
  legacy.modelVersion = '1.0.0';
  legacy.geographyMode = 'historical';
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await page.getByLabel('Treść scenariusza').fill(JSON.stringify(legacy));
  await page.getByRole('button', { name: 'Zweryfikuj i wczytaj' }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await page.reload();
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await page.getByRole('button', { name: 'Zastosuj geografię grup 2023' }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('226');
  await expect(page.getByLabel('Poparcie Koalicja Obywatelska', { exact: true })).toHaveValue(
    '33.54',
  );
  await page.getByRole('button', { name: 'Udostępnij ↗' }).click();
  const share = await page.getByLabel('Link do scenariusza').inputValue();
  const context = await browser.newContext();
  const shared = await context.newPage();
  await shared.goto(share);
  await shared.getByText('Geografia i frekwencja', { exact: true }).click();
  await expect(shared.getByRole('combobox', { name: 'Rozkład głosów', exact: true })).toHaveValue(
    'family',
  );
  await expect(shared.getByTestId('camp-L')).toHaveText('226');
  for (const family of families) {
    await expect(shared.getByTestId(`regional-national-${family}`)).toBeVisible();
  }
  await context.close();
});
