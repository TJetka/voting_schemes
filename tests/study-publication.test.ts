import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDefaultScenario } from '../src/model/presets';
import { buildStudyReport, type StudyReport } from '../src/model/studies';
import {
  matrixCornerOutcomes,
  matrixMergeEffects,
  studyCsv,
  studyMarkdown,
  type StudyPublication,
} from '../src/model/study-publication';

/** Read quoted CSV records, retaining embedded delimiters/newlines to test exported field boundaries. */
function readCsv(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      record.push(field);
      field = '';
    } else if (character === '\n' && !quoted) {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (character !== '\r' || quoted) field += character;
  }
  if (quoted || field || record.length)
    throw new Error('CSV must end on a complete quoted record.');
  return records;
}

function csvObjects(csv: string): {
  header: string[];
  records: string[][];
  rows: Record<string, string>[];
} {
  const [header, ...records] = readCsv(csv);
  return {
    header,
    records,
    rows: records.map((record) =>
      Object.fromEntries(header.map((name, index) => [name, record[index]])),
    ),
  };
}

let report: StudyReport;
let publication: StudyPublication;
let csv: ReturnType<typeof csvObjects>;
let markdown: string;
beforeAll(() => {
  report = buildStudyReport();
  publication = {
    report,
    provenance: {
      generatedAt: '2026-10-24T08:00:00.000Z',
      sourceGitSha: '0123456789abcdef0123456789abcdef01234567',
      sourceWorkingTreeDirty: false,
      analysisSourceSha256: 'a'.repeat(64),
      historicalDataSha256: 'b'.repeat(64),
      seed: null,
      command: 'npm run analyses -- --write',
    },
  };
  csv = csvObjects(studyCsv(publication));
  markdown = studyMarkdown(publication);
});

describe('complete, machine-readable publication CSV', () => {
  it('exports one uniform schema for every matrix cell, sampled point and reference', () => {
    expect(csv.header).toHaveLength(32);
    expect(new Set(csv.header).size).toBe(csv.header.length);
    expect(csv.header).toEqual(
      expect.arrayContaining([
        'analysis',
        'policy',
        'row',
        'column',
        'R_lists',
        'LC_lists',
        'target_support_pct',
        'donor_support_pct',
        'sample_kind',
        'LC_lower',
        'LC_upper',
        'R_lower',
        'R_upper',
        'pair_lower',
        'pair_upper',
        'block_status',
        'allocation_status',
        'best_LC_sample',
        'best_R_sample',
        'best_pair_sample',
      ]),
    );
    for (const row of csv.records) expect(row).toHaveLength(csv.header.length);
    const total =
      1560 +
      report.pairs.reduce((sum, pair) => sum + pair.points.length + 1, 0) +
      report.concentration.points.length +
      1 +
      1;
    expect(csv.rows).toHaveLength(total);
    expect(csv.rows.filter((row) => row.analysis === 'baseline')).toHaveLength(1);
    expect(csv.rows.filter((row) => row.sample_kind === 'pooled-reference')).toHaveLength(4);
  });

  it.each(['coalition', 'ordinary'] as const)(
    'preserves all 780 coordinates, list labels, primary outcomes and maxima flags for %s',
    (policy) => {
      const matrix = report.matrices[policy];
      const rows = csv.rows.filter((row) => row.analysis === 'matrix' && row.policy === policy);
      expect(rows).toHaveLength(780);
      expect(new Set(rows.map((row) => `${row.row}:${row.column}`)).size).toBe(780);
      for (const [index, cell] of matrix.cells.entries()) {
        const row = rows[index];
        expect(row.row).toBe(matrix.rows[cell.row].id);
        expect(row.column).toBe(matrix.columns[cell.column].id);
        expect(row.R_lists).toBe(matrix.rows[cell.row].label);
        expect(row.LC_lists).toBe(matrix.columns[cell.column].label);
        expect([row.LC_lower, row.LC_upper, row.R_lower, row.R_upper].map(Number)).toEqual([
          cell.outcome.lc.lower,
          cell.outcome.lc.upper,
          cell.outcome.r.lower,
          cell.outcome.r.upper,
        ]);
        expect(row.pair_lower).toBe('');
        expect(row.pair_upper).toBe('');
        expect(row.best_LC_sample).toBe(
          String(Number(matrix.summary.lc.bestIndices.includes(index))),
        );
        expect(row.best_R_sample).toBe(
          String(Number(matrix.summary.r.bestIndices.includes(index))),
        );
        expect(row.best_pair_sample).toBe('0');
      }
      expect(rows.some((row) => row.best_LC_sample === '1')).toBe(true);
      expect(rows.some((row) => row.best_R_sample === '1')).toBe(true);
    },
  );

  it('preserves every sample coordinate and flags only actual best sampled indices', () => {
    for (const study of [...report.pairs, report.concentration]) {
      const rows = csv.rows.filter(
        (row) => row.analysis === study.id && row.sample_kind !== 'pooled-reference',
      );
      expect(rows).toHaveLength(study.points.length);
      for (const [index, point] of study.points.entries()) {
        const row = rows[index];
        expect(Number(row.target_support_pct) * 1_000_000).toBeCloseTo(point.xUnits, 6);
        expect(Number(row.donor_support_pct) * 1_000_000).toBeCloseTo(point.otherUnits, 6);
        expect(row.sample_kind.split('|')).toEqual(point.kinds);
        expect(row.block_status).toBe(point.outcome.status);
        expect(row.allocation_status).toBe(point.outcome.allocationStatus);
        expect(row.best_LC_sample).toBe(
          String(Number(study.summary.lc.bestIndices.includes(index))),
        );
        expect(row.best_R_sample).toBe(String(Number(study.summary.r.bestIndices.includes(index))));
        expect(row.best_pair_sample).toBe(
          String(Number(study.summary.pair?.bestIndices.includes(index) ?? false)),
        );
      }
    }
  });

  it('keeps whole-block outcomes primary and distinguishes pair-only maxima and internal ties', () => {
    const baseline = csv.rows.find((row) => row.analysis === 'baseline')!;
    expect(baseline).toMatchObject({
      LC_lower: '226',
      LC_upper: '226',
      R_lower: '234',
      R_upper: '234',
      pair_lower: '',
      pair_upper: '',
      sample_kind: 'published-poll',
    });
    const konf = csv.rows.find(
      (row) => row.analysis === 'konf-kkp' && row.target_support_pct === '20',
    )!;
    expect(konf).toMatchObject({
      LC_lower: '218',
      R_lower: '242',
      pair_lower: '103',
      pair_upper: '103',
      best_R_sample: '1',
      best_pair_sample: '0',
    });
    const balanced = csv.rows.find(
      (row) => row.analysis === 'lc-concentration' && row.target_support_pct === '25.805',
    )!;
    expect(balanced).toMatchObject({
      donor_support_pct: '25.805',
      LC_lower: '255',
      LC_upper: '255',
      R_lower: '205',
      R_upper: '205',
      block_status: 'resolved',
      allocation_status: 'ambiguous',
      pair_lower: '',
      pair_upper: '',
    });
  });

  it('labels pooled benchmarks as common lists instead of assigning all support to one member', () => {
    for (const pair of report.pairs) {
      const row = csv.rows.find(
        (record) => record.analysis === pair.id && record.sample_kind === 'pooled-reference',
      )!;
      expect(row).toMatchObject({
        policy: 'coalition',
        target: `Wspólna lista: ${pair.targetLabel} + ${pair.donorLabel}`,
        donor: '',
        donor_support_pct: '',
        best_LC_sample: '0',
        best_R_sample: '0',
        best_pair_sample: '0',
      });
      expect(Number(row.target_support_pct) * 1_000_000).toBeCloseTo(pair.totalUnits, 6);
      expect(Number(row.pair_lower)).toBe(pair.pooled.pair!.lower);
    }
    const united = csv.rows.find(
      (row) => row.analysis === 'lc-concentration' && row.sample_kind === 'pooled-reference',
    )!;
    expect(united).toMatchObject({
      target: 'Jedna partia L+C',
      donor: '',
      donor_support_pct: '',
      LC_lower: '264',
      R_lower: '196',
    });
  });

  it('retains source and generation metadata on every row and keeps frozen inputs immutable', () => {
    const before = structuredClone(publication);
    studyCsv(publication);
    studyMarkdown(publication);
    expect(publication).toEqual(before);
    expect(report.metadata.scenario).toEqual(createDefaultScenario());
    for (const row of csv.rows) {
      expect(row).toMatchObject({
        model_version: report.metadata.modelVersion,
        analysis_version: report.metadata.analysisVersion,
        data_version: report.metadata.dataVersion,
        poll_id: report.metadata.pollId,
        geography: 'family',
        source_git_sha: publication.provenance.sourceGitSha,
        analysis_source_sha256: publication.provenance.analysisSourceSha256,
        historical_data_sha256: publication.provenance.historicalDataSha256,
        generated_at: publication.provenance.generatedAt,
      });
    }
  });

  it('quotes embedded CSV punctuation and prevents exported text from becoming a spreadsheet formula', () => {
    const changed = structuredClone(publication);
    const label = '=SUM(1,2)\n"cytat"';
    changed.report.pairs[0].targetLabel = label;
    const parsed = csvObjects(studyCsv(changed));
    for (const record of parsed.records) expect(record).toHaveLength(parsed.header.length);
    const rows = parsed.rows.filter(
      (row) =>
        row.analysis === changed.report.pairs[0].id && row.sample_kind !== 'pooled-reference',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.target).toBe(`'${label}`);
  });
});

describe('publishable conclusions and self-contained source links', () => {
  it.each(['coalition', 'ordinary'] as const)(
    'explains the effect of merging either block under %s',
    (policy) => {
      const matrix = report.matrices[policy];
      const corners = matrixCornerOutcomes(matrix);
      for (const [key, lc, r] of [
        ['separate', 226, 234],
        ['lcUnited', 264, 196],
        ['rUnited', 194, 266],
        ['bothUnited', 233, 227],
      ] as const) {
        expect(corners[key].lc).toEqual({ lower: lc, upper: lc });
        expect(corners[key].r).toEqual({ lower: r, upper: r });
      }
      expect(matrixMergeEffects(matrix)[0]).toContain('234 → 266 (zmiana o 32)');
      expect(matrixMergeEffects(matrix)[0]).toContain('196 → 227 (zmiana o 31)');
      expect(matrixMergeEffects(matrix)[1]).toContain('226 → 264 (zmiana o 38)');
      expect(matrixMergeEffects(matrix)[1]).toContain('194 → 233 (zmiana o 39)');
      // Presentation order must not change which configurations are being compared.
      expect(
        matrixCornerOutcomes({
          ...matrix,
          rows: [...matrix.rows].reverse(),
          columns: [...matrix.columns].reverse(),
          cells: [...matrix.cells].reverse().map((cell) => ({
            ...cell,
            row: matrix.rows.length - 1 - cell.row,
            column: matrix.columns.length - 1 - cell.column,
          })),
        }),
      ).toEqual(corners);
    },
  );

  it('includes both blocks and merger effects in the publication overview', () => {
    expect(markdown).toContain('| R osobno | L+C 226 : R 234 | L+C 264 : R 196 |');
    expect(markdown).toContain('| R razem | L+C 194 : R 266 | L+C 233 : R 227 |');
    expect(markdown).toContain('Połączenie R:');
    expect(markdown).toContain('Ten sam kolor nie oznacza tego samego wyniku');
  });

  it('reports all five studies with correct block outcomes and separate pair outcomes', () => {
    expect(markdown.match(/^## [1-5]\. /gm)).toHaveLength(5);
    expect(markdown).toContain('**Punkt wyjścia:** L+C 226 : R 234');
    expect(markdown).toContain('233–264 mandatów we wszystkich 15 sposobach podziału R');
    expect(markdown).toContain('L+C 233 : R 227');
    expect(markdown).toContain('| Koalicje 8% | 194–264 | 357 | 383 | 40 | 0 |');
    expect(markdown).toContain('| Jeden komitet 5% | 194–264 | 383 | 362 | 35 | 0 |');
    expect(markdown).toContain('Najwyższy wynik bloku L+C w badanych próbkach: **241 mandatów**');
    expect(markdown).toContain('Najwyższy wynik bloku R w badanych próbkach: **242 mandatów**');
    expect(markdown).toContain('Najwyższy wynik bloku R w badanych próbkach: **243 mandatów**');
    for (const maximum of [58, 105, 154])
      expect(markdown).toContain(
        `Najwięcej mandatów samej pary w badanych próbkach: **${maximum}**`,
      );
    expect(markdown).toContain('| Pięć osobnych podmiotów L+C | L+C 226 : R 234 |');
    expect(markdown).toContain('| Jedna partia L+C | L+C 264 : R 196 |');
    expect(markdown).toContain('| Dwie równe partie: 25,805% + 25,805% | L+C 255 : R 205 |');
  });

  it('lists actual best samples and separates finite sampling claims from full matrix enumeration', () => {
    const percentage = (units: number) =>
      new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 6 }).format(units / 1_000_000) + '%';
    for (const pair of report.pairs)
      for (const index of pair.summary.pair!.bestIndices)
        expect(markdown).toContain(
          `${pair.targetLabel} ${percentage(pair.points[index].xUnits)} / ${pair.donorLabel} ${percentage(pair.points[index].otherUnits)}`,
        );
    for (const index of report.concentration.summary.lc.bestIndices)
      expect(markdown).toContain(
        `A ${percentage(report.concentration.points[index].xUnits)} / B ${percentage(report.concentration.points[index].otherUnits)}`,
      );
    expect(markdown).toContain('0,25 p.p.');
    expect(markdown).toContain('0,5 p.p.');
    expect(markdown).toContain('0,000001 p.p.');
    expect(markdown).toContain('licząc od obu krańców');
    expect(markdown).toContain('nie dowodzą położenia przejść między nimi');
    expect(markdown).toContain('nie dowodem globalnego optimum ciągłego');
    expect(markdown).toContain('Pełna macierz układów jest enumeracją dokładną');
    expect(markdown).toContain('nie prawdopodobieństwem wyniku');
  });

  it('includes reproducibility metadata and resolvable absolute links after the document is downloaded', () => {
    expect(markdown).toContain(publication.provenance.sourceGitSha!);
    expect(markdown).toContain(publication.provenance.analysisSourceSha256);
    expect(markdown).toContain(publication.provenance.historicalDataSha256);
    expect(markdown).toContain(publication.provenance.generatedAt);
    expect(markdown).toContain('zmiany robocze przy generowaniu: nie');
    expect(markdown).toContain('ziarno losowe: nie dotyczy');
    expect(markdown).toContain('`npm run analyses -- --write`');
    expect(markdown).toContain('Pełny scenariusz wejściowy jest zapisany w JSON raportu');
    const links = [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) expect(new URL(link).protocol).toBe('https:');
    for (const link of report.metadata.sourceUrls) expect(links).toContain(link);
    expect(links).toContain(
      'https://github.com/TJetka/voting_schemes/blob/main/src/data/source-manifest.json',
    );
  });
});

describe('versioned publication artifacts', () => {
  it('reproduces the bundled calculations from their frozen inputs and actual historical bytes', () => {
    const bundled = JSON.parse(
      readFileSync(new URL('../src/data/studies-report.json', import.meta.url), 'utf8'),
    ) as StudyPublication;
    expect(bundled.report).toEqual(report);
    expect(bundled.report.metadata.scenario).toEqual(createDefaultScenario());
    const historicalBytes = readFileSync(new URL('../src/data/historical.json', import.meta.url));
    expect(bundled.provenance.historicalDataSha256).toBe(
      createHash('sha256').update(historicalBytes).digest('hex'),
    );
    expect(bundled.provenance.analysisSourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundled.provenance.seed).toBeNull();
    expect(Number.isFinite(Date.parse(bundled.provenance.generatedAt))).toBe(true);
  });

  it('reproduces the publishable Markdown and CSV exactly from the bundled report', () => {
    const bundled = JSON.parse(
      readFileSync(new URL('../src/data/studies-report.json', import.meta.url), 'utf8'),
    ) as StudyPublication;
    const markdownFile = readFileSync(
      new URL('../analyses/pollster-2026-10/wnioski.md', import.meta.url),
      'utf8',
    );
    const csvFile = readFileSync(
      new URL('../analyses/pollster-2026-10/wyniki.csv', import.meta.url),
      'utf8',
    );
    expect(
      markdownFile === studyMarkdown(bundled),
      'Published Markdown is stale; regenerate reviewed analysis artifacts.',
    ).toBe(true);
    expect(
      csvFile === studyCsv(bundled),
      'Published CSV is stale; regenerate reviewed analysis artifacts.',
    ).toBe(true);
  });

  it('does not label a hypothetical A/B split as an observed current poll', () => {
    expect(report.concentration.points.every((point) => !point.kinds.includes('current'))).toBe(
      true,
    );
    const rows = csv.rows.filter((row) => row.analysis === 'lc-concentration');
    expect(rows.every((row) => !row.sample_kind.split('|').includes('current'))).toBe(true);
  });
});
