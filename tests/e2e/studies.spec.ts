import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { StudyPublication } from '../../src/model/study-publication';

async function openReport(page: Page): Promise<void> {
  await page.goto('./?view=analyses');
  await expect(
    page.getByRole('heading', { name: 'Jak podział głosów zmienia większość?' }),
  ).toBeVisible();
}

async function downloadedText(
  page: Page,
  button: Locator,
): Promise<{ filename: string; text: string }> {
  const downloaded = page.waitForEvent('download');
  await button.click();
  const file = await downloaded;
  return { filename: file.suggestedFilename(), text: await readFile((await file.path())!, 'utf8') };
}

test('published report stays frozen while the editable laboratory keeps its scenario', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Połącz L', exact: true }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('247');
  await page.getByRole('tab', { name: /Analizy i wnioski/ }).click();
  await expect(page).toHaveURL(/\?view=analyses$/);
  await expect(
    page.getByLabel('Punkt wyjścia: wszystkie podmioty osobno: L+C 226, R 234 mandatów', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Edycje w laboratorium nie zmieniają poniższych analiz/),
  ).toBeVisible();
  await expect(page.getByTestId('camp-L')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: /Analizy i wnioski/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByLabel('Punkt wyjścia: wszystkie podmioty osobno: L+C 226, R 234 mandatów', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /01Koalicje/ }).click();
  await expect(page.getByTestId('camp-L')).toHaveText('247');
  await expect(page).not.toHaveURL(/view=analyses/);
});

test('the full 15 by 52 matrix exposes both blocks, legal policy and keyboard selection', async ({
  page,
}) => {
  await openReport(page);
  const section = page.locator('#study-matrix');
  const matrix = page.getByRole('table', { name: 'Macierz R kontra L+C', exact: true });
  await expect(matrix.locator('tbody tr')).toHaveCount(15);
  await expect(matrix.locator('thead th')).toHaveCount(53);
  await expect(matrix.getByRole('button')).toHaveCount(780);
  await expect(section.locator('.study-stat-grid > div').nth(2)).toContainText('357');
  await expect(section.locator('.study-stat-grid > div').nth(3)).toContainText('383');
  const initial = matrix.getByRole('button', { name: /^R01, LC01: L\+C 226, R 234\./ });
  await expect(initial).toHaveAttribute('aria-pressed', 'true');
  await initial.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const selected = matrix.getByRole('button', { name: /^R02, LC02:/ });
  await expect(selected).toBeFocused();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  const label = await selected.getAttribute('aria-label');
  const seats = label!.match(/L\+C (\d+), R (\d+)/)!;
  await expect(page.getByTestId('study-matrix-selection')).toContainText('R02 × LC02');
  await expect(
    page
      .getByTestId('study-matrix-selection')
      .getByLabel(`Wynik całych bloków: L+C ${seats[1]}, R ${seats[2]} mandatów`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Próg wspólnych list w analizie' })
    .selectOption('ordinary');
  await expect(section.locator('.study-stat-grid > div').nth(2)).toContainText('383');
  await expect(section.locator('.study-stat-grid > div').nth(3)).toContainText('362');
  await expect(matrix.getByRole('button')).toHaveCount(780);
  await matrix.getByRole('button', { name: /^R15, LC52:/ }).click();
  await expect(
    page
      .getByTestId('study-matrix-selection')
      .getByLabel('Wynik całych bloków: L+C 233, R 227 mandatów', { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText(/Jeden układ L\+C zachowuje większość przy wszystkich 15 podziałach R/),
  ).toBeVisible();
});

test('all three pair studies lead with block outcomes and distinguish pair maxima', async ({
  page,
}) => {
  await openReport(page);
  for (const [id, block, maximumBlock, maximumPair, currentPair, lc, r] of [
    ['razem-nl', 'L+C', 241, 58, 33, 241, 219],
    ['konf-kkp', 'R', 242, 105, 94, 218, 242],
    ['pis-rozwoj', 'R', 243, 154, 140, 217, 243],
  ] as const) {
    const section = page.locator(`#study-${id}`);
    await expect(section.getByText(`obecnie: ${currentPair}`, { exact: true })).toBeVisible();
    await expect(section.locator('.study-stat-grid > div').last()).toContainText(
      String(maximumPair),
    );
    await expect(section).toContainText(
      `Najwyższy wynik całego bloku ${block}: ${maximumBlock} mandatów.`,
    );
    const charts = section.locator('figure.study-chart');
    await expect(charts).toHaveCount(2);
    await charts.first().getByRole('slider').focus();
    await page.keyboard.press('Home');
    await expect(charts.first().locator('.study-selected-point')).toContainText(
      `L+C ${lc} : R ${r}`,
    );
    await charts.last().getByRole('slider').focus();
    await page.keyboard.press('Home');
    await expect(charts.last().locator('.study-selected-point')).toContainText(
      `Badana para: ${maximumPair} mandatów`,
    );
    await expect(section).toContainText(
      'Optimum pary i optimum całego bloku są oceniane oddzielnie.',
    );
  }
});

test('hypothetical C+L concentration compares default, one party and an equal split', async ({
  page,
}) => {
  await openReport(page);
  const section = page.locator('#study-lc-concentration');
  await expect(
    section.getByLabel('Sondaż: obecne podmioty L+C osobno: L+C 226, R 234 mandatów', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    section.getByLabel('Cały blok L+C jako jedna partia: L+C 264, R 196 mandatów', { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByLabel('Dwie równe partie: 25,805% + 25,805%: L+C 255, R 205 mandatów', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(section).toContainText('ten sam połączony elektorat regionalny L+C proporcjonalnie');
  const slider = section.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(section.locator('.study-selected-point')).toContainText('L+C 264 : R 196');
  await page.keyboard.press('End');
  await expect(section.locator('.study-selected-point')).toContainText('L+C 264 : R 196');
  await expect(section.locator('.study-selected-point')).toContainText('Partia A: 51,61%');
});

test('publication downloads carry complete calculations, assumptions and standalone SVG figures', async ({
  page,
}) => {
  await openReport(page);
  await page.getByRole('button', { name: 'Kopiuj link do raportu', exact: true }).click();
  const link = new URL(await page.getByLabel('Link do raportu', { exact: true }).inputValue());
  expect(link.pathname).toBe('/voting_schemes/');
  expect(link.search).toBe('?view=analyses');
  expect(link.hash).toBe('');
  const json = await downloadedText(
    page,
    page.getByRole('button', { name: 'Pobierz raport (JSON)', exact: true }),
  );
  const publication = JSON.parse(json.text) as StudyPublication;
  expect(publication.report.metadata.pollId).toBe('pollster-2026-10-19-21');
  expect(publication.report.baseline.lc).toEqual({ lower: 226, upper: 226 });
  expect(publication.report.matrices.coalition.cells).toHaveLength(780);
  expect(publication.report.matrices.ordinary.cells).toHaveLength(780);
  expect(publication.provenance.analysisSourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(publication.provenance.historicalDataSha256).toMatch(/^[a-f0-9]{64}$/);
  const markdown = await downloadedText(
    page,
    page.getByRole('button', { name: 'Pobierz wnioski (Markdown)', exact: true }),
  );
  expect(markdown.text).toContain('L+C 233 : R 227');
  expect(markdown.text).toContain('L+C 264 : R 196');
  expect(markdown.text).toContain('Maksima przepływów są maksimami próbkowanymi');
  const csv = await downloadedText(
    page,
    page.getByRole('button', { name: 'Pobierz wszystkie wyniki (CSV)', exact: true }),
  );
  const dataRows =
    1560 +
    publication.report.pairs.reduce((sum, pair) => sum + pair.points.length, 0) +
    publication.report.concentration.points.length +
    5;
  expect(csv.text.trimEnd().split('\n')).toHaveLength(dataRows + 1);
  expect(csv.text.split('\n')[0]).toContain('"LC_lower","LC_upper","R_lower","R_upper"');
  expect(csv.text).toContain('"threshold-neighbour');
  const matrixSvg = await downloadedText(
    page,
    page.getByRole('button', { name: 'Pobierz macierz SVG', exact: true }),
  );
  expect(matrixSvg.filename).toMatch(/\.svg$/);
  expect(matrixSvg.text).toContain('<svg');
  expect(matrixSvg.text).toContain('R15');
  expect(matrixSvg.text).toContain('LC52');
  expect(matrixSvg.text).toContain('koalicja 8%');
  const chartSvg = await downloadedText(
    page,
    page
      .locator('#study-razem-nl')
      .getByRole('button', { name: 'Pobierz SVG', exact: true })
      .first(),
  );
  expect(chartSvg.text).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(chartSvg.text).toContain('Blok L+C');
  expect(chartSvg.text).toContain('Blok R');
  expect(chartSvg.text).toContain('2026-10');
});

test('report stays usable on mobile and offers a focused print layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReport(page);
  await expect(
    page.getByRole('heading', { name: 'Jak podział głosów zmienia większość?' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const matrix = page.getByRole('region', {
    name: 'Macierz wszystkich konfiguracji, przewijana w poziomie',
  });
  expect(await matrix.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Drukuj / zapisz PDF', exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(matrix).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Jak podział głosów zmienia większość?' }),
  ).toBeVisible();
  await expect(page.locator('#study-razem-nl svg').first()).toBeVisible();
});
