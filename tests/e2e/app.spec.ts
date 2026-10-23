import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('fresh preset exposes source, inactive unmeasured PPS, locked residual and official replay', async ({
  page,
}) => {
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await expect(page.getByTestId('camp-R')).toHaveText('232');
  await expect(page.getByText('Pollster · 19–21.10.2026 · n = 1014')).toBeVisible();
  await expect(
    page.getByLabel('Poparcie Polska Partia Socjalistyczna', { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Brak osobnego pomiaru; 0% przydzielone w scenariuszu'),
  ).toBeVisible();
  await expect(page.getByText('Unia Centrum 0,15% + inne 0,36% · stała reszta')).toBeVisible();
  await page.getByRole('button', { name: 'Odtwórz 2023' }).click();
  await expect(page.getByText('✓ Zgodność wszystkich 41 okręgów i 460 mandatów')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('194');
  await expect(page.getByRole('dialog')).toContainText('157');
});

test('keyboard pooling shows committee form, 59 seats and net camp gain; undo restores partition', async ({
  page,
}) => {
  const nl = page.getByRole('checkbox', { name: 'Zaznacz Nowa Lewica do połączenia' });
  await nl.focus();
  await page.keyboard.press('Space');
  const razem = page.getByRole('checkbox', { name: 'Zaznacz Partia Razem do połączenia' });
  await razem.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Połącz zaznaczone (2)' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('list-nl+razem').getByRole('combobox')).toHaveValue('coalition');
  await expect(page.getByTestId('seats-nl+razem')).toHaveText('59');
  await expect(page.getByTestId('camp-L')).toHaveText('244');
  await expect(page.getByText('NL + Razem: 33 → 59 mandatów (+26)')).toBeVisible();
  await expect(page.getByText(/Inne listy grupy L: -10. Cała grupa L: \+16/)).toBeVisible();
  await page.getByRole('button', { name: 'Cofnij zmianę', exact: true }).click();
  await expect(page.getByTestId('seats-nl')).toHaveText('27');
  await expect(page.getByTestId('camp-L')).toHaveText('228');
});

test('L and R cannot merge even with a centre bridge', async ({ page }) => {
  for (const name of [
    'Koalicja Obywatelska',
    'Prawo i Sprawiedliwość',
    'Polskie Stronnictwo Ludowe',
  ]) {
    await page.getByRole('checkbox', { name: `Zaznacz ${name} do połączenia` }).check();
  }
  await expect(page.getByRole('button', { name: 'Połącz zaznaczone (3)' })).toBeDisabled();
  await expect(
    page.getByText('Nie można utworzyć listy łączącej L i R — również przez centrum.'),
  ).toBeVisible();
});

test('centre 8% versus 5% changes eligibility and exposes two alternative majorities', async ({
  page,
}) => {
  for (const name of ['Polskie Stronnictwo Ludowe', 'Polska 2050']) {
    await page.getByRole('checkbox', { name: `Zaznacz ${name} do połączenia` }).check();
  }
  await page.getByRole('button', { name: 'Połącz zaznaczone (2)' }).click();
  const list = page.getByTestId('list-pl2050+psl');
  await expect(list.getByRole('combobox')).toHaveValue('coalition');
  await expect(page.getByTestId('seats-pl2050+psl')).toHaveText('0');
  await list.getByRole('combobox').selectOption('ordinary');
  await expect(page.getByTestId('seats-pl2050+psl')).toHaveText('6');
  await expect(page.getByTestId('left-centre')).toHaveText('231');
  await expect(page.getByTestId('right-centre')).toHaveText('235');
  await list.getByRole('checkbox', { name: /Sojusz:/ }).check();
  await expect(page.getByTestId('alliance-seats')).toHaveText('6');
});

test('turnout changes headcounts while seats remain fixed; explicit donors conserve support', async ({
  page,
}) => {
  await page.getByText('Geografia i frekwencja', { exact: true }).click();
  const originalBallots = await page.getByTestId('expected-ballots').textContent();
  await page.getByLabel('Frekwencja', { exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('expected-ballots')).not.toHaveText(originalBallots!);
  await expect(page.getByTestId('camp-L')).toHaveText('228');
  await expect(page.getByTestId('camp-R')).toHaveText('232');
  await page.getByLabel('Zmianę finansują').selectOption('selected');
  await page.getByLabel('Wybrany dawca').selectOption('nl');
  await page.getByLabel('Poparcie Partia Razem', { exact: true }).fill('6');
  await page.getByLabel('Poparcie Partia Razem', { exact: true }).press('Enter');
  await expect(page.getByLabel('Poparcie Nowa Lewica', { exact: true })).toHaveValue('6.91');
  await expect(page.getByLabel('Poparcie Koalicja Obywatelska', { exact: true })).toHaveValue(
    '33.54',
  );
  await expect(page.locator('.total')).toContainText('100%');
  await expect(page.getByRole('status')).toContainText('Pula: NL');
});

test('JSON export/import and shared URL reproduce edited scenario in clean browser contexts', async ({
  page,
  browser,
}) => {
  await page.getByRole('button', { name: 'Połącz L', exact: true }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('253');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksport JSON' }).click();
  const file = await download;
  const exported = await readFile((await file.path())!, 'utf8');
  const clean = await browser.newContext();
  const imported = await clean.newPage();
  await imported.goto(page.url());
  await expect(imported.getByTestId('camp-L')).toHaveText('228');
  await imported.getByRole('button', { name: 'Import JSON' }).click();
  await imported.getByLabel('Treść scenariusza').fill(exported);
  await imported.getByRole('button', { name: 'Zweryfikuj i wczytaj' }).click();
  await expect(imported.getByTestId('camp-L')).toHaveText('253');
  await page.getByRole('button', { name: 'Udostępnij ↗' }).click();
  const share = await page.getByLabel('Link do scenariusza').inputValue();
  expect(new URL(share).pathname).toBe('/voting_schemes/');
  expect(new URL(share).hash).toMatch(/^#s=/);
  const sharedContext = await browser.newContext();
  const shared = await sharedContext.newPage();
  await shared.goto(share);
  await expect(shared.getByTestId('camp-L')).toHaveText('253');
  await shared.reload();
  await expect(shared.getByTestId('camp-L')).toHaveText('253');
  await clean.close();
  await sharedContext.close();
});

test('district inspector explains quotient gap; mobile layout keeps controls usable', async ({
  page,
}) => {
  await page.getByRole('button', { name: '19. Warszawa', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Szczegóły okręgu 19' })).toContainText(
    'OSTATNI WYGRYWAJĄCY ILORAZ',
  );
  await expect(page.getByRole('region', { name: 'Szczegóły okręgu 19' })).toContainText(
    'nie krajowy transfer poparcia',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Połącz L', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
