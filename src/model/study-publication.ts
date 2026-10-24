import type { PairStudy, StudyOutcome, StudyPoint, StudyReport } from './studies-types';
import type { SeatBounds } from './types';

export interface StudyPublication {
  report: StudyReport;
  provenance: {
    generatedAt: string;
    sourceGitSha: string | null;
    sourceWorkingTreeDirty: boolean | null;
    analysisSourceSha256: string;
    historicalDataSha256: string;
    seed: null;
    command: string;
  };
}

const pct = (units: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 6 }).format(units / 1_000_000) + '%';
const seats = (bounds: SeatBounds) =>
  bounds.lower === bounds.upper ? String(bounds.lower) : `${bounds.lower}–${bounds.upper}`;
const blocks = (outcome: StudyOutcome) => `L+C ${seats(outcome.lc)} : R ${seats(outcome.r)}`;

function sampleList(
  points: StudyPoint[],
  indices: number[],
  target: string,
  donor: string,
): string {
  if (!indices.length) return 'Nie ma jednoznacznego maksimum z powodu nierozstrzygniętych granic.';
  const samples = indices
    .slice(0, 16)
    .map(
      (index) =>
        `${target} ${pct(points[index].xUnits)} / ${donor} ${pct(points[index].otherUnits)}`,
    );
  return (
    samples.join('; ') +
    (indices.length > 16 ? `; pozostałe ${indices.length - 16} próbek w CSV.` : '.')
  );
}

/** Publication text reports complete finite comparisons and sampled extrema as distinct claims. */
export function studyMarkdown(publication: StudyPublication): string {
  const { report, provenance } = publication;
  const { metadata, concentration } = report;
  const figures =
    'https://raw.githubusercontent.com/TJetka/voting_schemes/main/analyses/pollster-2026-10';
  const both = report.matrices.coalition;
  const unitedColumn = both.columns.findIndex((column) => column.groups.length === 1);
  const unitedRow = both.rows.findIndex((row) => row.groups.length === 1);
  const united = both.cells.find((cell) => cell.column === unitedColumn && cell.row === unitedRow)!;
  const guaranteed = both.columnSummaries[unitedColumn];
  const balanced = concentration.points.find(
    (point) => point.xUnits * 2 === concentration.totalUnits,
  )!;
  const lines = [
    '# Te same głosy, inny podział mandatów — pięć analiz L+C kontra R',
    '',
    `**Źródło poparcia:** ${metadata.pollster}, badanie ${metadata.fieldworkStart}–${metadata.fieldworkEnd}, publikacja ${metadata.publicationDate}, n = ${metadata.sampleSize}. To zamrożony sondaż używany w aplikacji, nie automatycznie aktualizowana średnia sondaży.`,
    '',
    `**Punkt wyjścia:** ${blocks(report.baseline)}. Wynik główny zawsze dotyczy całych bloków: wszystkie podmioty L i C należą do L+C, wszystkie R do R. Mandaty badanych par są wynikiem pomocniczym.`,
    '',
    '## Najważniejsze wnioski',
    '',
    `- Przy niezmienionym poparciu jedna lista L+C osiąga ${guaranteed.minimum}–${guaranteed.maximum} mandatów we wszystkich ${both.rows.length} sposobach podziału R. Gdy oba bloki startują jako pojedyncze listy: ${blocks(united.outcome)}. To wynik pełnego porównania układów, przy założeniu zachowania wszystkich głosów.`,
    `- Przy R pozostającym w czterech osobnych partiach, połączenie L+C daje ${blocks(concentration.oneParty)}, a równy podział na dwie hipotetyczne partie daje ${blocks(balanced.outcome)}.`,
    '- Więcej mandatów badanej pary nie musi oznaczać takiego samego wzrostu całego bloku: część mandatów może pochodzić od innych list tego samego bloku. Progi potęgują stratę, gdy mała partia zatrzymuje głosy, ale nie zdobywa mandatów.',
    '',
    '## 1. Wszystkie układy list: macierz R × L+C',
    '',
    `${both.rows.length} wierszy R × ${both.columns.length} kolumn L+C = ${both.cells.length} kompletnych układów dla każdej polityki progowej. Nie ma połączeń C z R. Nieaktywny PPS pozostaje poza podziałami. Wspólne listy mają jednolicie próg 8% lub 5%; osobne partie zawsze 5%. Nie badamy wszystkich niezależnych kombinacji form prawnych w jednej macierzy.`,
    '',
    '| Wspólne listy | Zakres mandatów L+C | Większość L+C | Większość R | Brak większości | Nierozstrzygnięte |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...(['coalition', 'ordinary'] as const).map((policy) => {
      const s = report.matrices[policy].summary;
      return `| ${policy === 'coalition' ? 'Koalicje 8%' : 'Jeden komitet 5%'} | ${s.lc.minimum}–${s.lc.maximum} | ${s.lcMajorities} | ${s.rMajorities} | ${s.noMajority} | ${s.unresolved} |`;
    }),
    '',
    'Liczby układów są opisem enumeracji, nie prawdopodobieństwem wyniku. Kolumny i wiersze są opisane w macierzach SVG i w CSV.',
    '',
    `![Macierz R kontra L+C, wspólne listy 8%](${figures}/macierz-coalition.svg)`,
    `[Macierz dla wspólnych list 5%](${figures}/macierz-ordinary.svg)`,
    '',
  ];
  report.pairs.forEach((pair, index) => {
    const current = pair.points.find((point) => point.xUnits === pair.baselineUnits)!;
    const block = pair.block === 'LC' ? pair.summary.lc : pair.summary.r;
    const representative = pair.points[block.bestIndices[0]];
    lines.push(
      `## ${index + 2}. ${pair.targetLabel} ↔ ${pair.donorLabel}`,
      '',
      `Stała suma ${pct(pair.totalUnits)}. Przesuwamy wyłącznie głosy tej pary; pozostałe partie, okręgowe sumy głosów i ich rozkład pozostają zamrożone. Wspólny profil historyczny pozwala podzielić niezmienny elektorat pary proporcjonalnie w każdym okręgu.`,
      '',
      `Obecny podział: ${pair.targetLabel} ${pct(pair.baselineUnits)} / ${pair.donorLabel} ${pct(pair.totalUnits - pair.baselineUnits)} → **${blocks(current.outcome)}**; para łącznie ${seats(current.outcome.pair!)} mandatów.`,
      '',
      `Najwyższy wynik bloku ${pair.block === 'LC' ? 'L+C' : 'R'} w badanych próbkach: **${block.maximum} mandatów**${representative ? `, np. ${pair.targetLabel} ${pct(representative.xUnits)} / ${pair.donorLabel} ${pct(representative.otherUnits)} → ${blocks(representative.outcome)}` : ''}.`,
      '',
      `Najwięcej mandatów samej pary w badanych próbkach: **${pair.summary.pair!.maximum}**. Podziały osiągające to maksimum: ${sampleList(pair.points, pair.summary.pair!.bestIndices, pair.targetLabel, pair.donorLabel)}`,
      '',
      `Wspólna lista tej pary (8%, bez utraty głosów): **${blocks(pair.pooled)}**; para ${seats(pair.pooled.pair!)} mandatów. To osobny punkt odniesienia, a nie przypisanie mandatów poszczególnym członkom wspólnej listy.`,
      '',
      `![${pair.targetLabel} / ${pair.donorLabel}: wynik całych bloków](${figures}/${pair.id}-bloki.svg)`,
      `![${pair.targetLabel} / ${pair.donorLabel}: mandaty pary](${figures}/${pair.id}-para.svg)`,
      '',
    );
  });
  lines.push(
    '## 5. L+C: domyślny podział, jedna partia i dwie hipotetyczne partie',
    '',
    `Całkowite poparcie L+C wynosi ${pct(concentration.totalUnits)}. R pozostaje w układzie bazowym. Partie A i B mają identyczny profil: dzielą w stałej proporcji już skalibrowane głosy L+C w każdym okręgu. To eksperyment o rozdrobnieniu i progach, nie model geografii konkretnych nowych partii.`,
    '',
    '| Wariant | Wynik całych bloków |',
    '| --- | --- |',
    `| Pięć osobnych podmiotów L+C | ${blocks(concentration.defaultOutcome)} |`,
    `| Jedna partia L+C | ${blocks(concentration.oneParty)} |`,
    `| Dwie równe partie: ${pct(balanced.xUnits)} + ${pct(balanced.otherUnits)} | ${blocks(balanced.outcome)} |`,
    `| Zakres L+C w przebadanych podziałach na A i B | ${concentration.summary.lc.minimum}–${concentration.summary.lc.maximum} mandatów |`,
    '',
    `Najlepsze przebadane podziały A/B dla L+C: ${sampleList(concentration.points, concentration.summary.lc.bestIndices, 'A', 'B')}`,
    '',
    'Remisy między A i B mogą uniemożliwiać wskazanie mandatu konkretnej partii, pozostawiając dokładny wynik całego L+C. Wnioski opierają się na granicach wspólnego bloku, bez arbitralnego rozdzielania takich mandatów.',
    '',
    `![Dwie hipotetyczne partie L+C: wynik całych bloków](${figures}/lc-concentration-bloki.svg)`,
    '',
    '## Jak czytać wyniki i odtworzyć analizę',
    '',
    'Przesunięcia par badamy nominalnie co 0,25 p.p., a podział A/B co 0,5 p.p., licząc od obu krańców. Dodajemy końce zakresu, podział bazowy, dokładne 5% i sąsiadów odległych o 0,000001 p.p.; w A/B także środek. Wykresy łączą próbki, lecz nie dowodzą położenia przejść między nimi. Maksima przepływów są maksimami próbkowanymi, a nie dowodem globalnego optimum ciągłego. Pełna macierz układów jest enumeracją dokładną.',
    '',
    ...metadata.assumptions.map((assumption) => `- ${assumption}`),
    '',
    `Model ${metadata.modelVersion}; analiza ${metadata.analysisVersion}; dane ${metadata.dataVersion}; geografia ${metadata.geographyMode}; składnik jednorodny ${metadata.regularizer}.`,
    '',
    `Wygenerowano: ${provenance.generatedAt}. Kod: ${provenance.sourceGitSha ?? 'SHA niedostępne'}; zmiany robocze przy generowaniu: ${provenance.sourceWorkingTreeDirty === null ? 'nieustalone' : provenance.sourceWorkingTreeDirty ? 'tak' : 'nie'}. SHA-256 źródeł analizy: ${provenance.analysisSourceSha256}. SHA-256 danych PKW: ${provenance.historicalDataSha256}. Model deterministyczny, ziarno losowe: nie dotyczy.`,
    '',
    `Odtworzenie: \`${provenance.command}\`. Pełny scenariusz wejściowy jest zapisany w JSON raportu.`,
    '',
    'Źródła sondażu:',
    ...metadata.sourceUrls.map((url, index) => `- [Publikacja ${index + 1}](${url})`),
    '- [Oficjalne wyniki PKW/KBW](https://danewyborcze.kbw.gov.pl/dane/2023/sejmsenat/wyniki_gl_na_listy_po_okregach_sejm_csv.zip)',
    '- [Manifest źródeł i ich sumy kontrolne](https://github.com/TJetka/voting_schemes/blob/main/src/data/source-manifest.json)',
    '',
  );
  return lines.join('\n');
}

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

/** Complete row-wise matrix and sweep outputs, including provenance and conservative bounds. */
export function studyCsv(publication: StudyPublication): string {
  const { report, provenance } = publication;
  const rows: (string | number)[][] = [
    [
      'analysis',
      'policy',
      'row',
      'column',
      'R_lists',
      'LC_lists',
      'target',
      'donor',
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
      'excluded_vote_share',
      'best_LC_sample',
      'best_R_sample',
      'best_pair_sample',
      'model_version',
      'analysis_version',
      'data_version',
      'poll_id',
      'geography',
      'source_git_sha',
      'analysis_source_sha256',
      'historical_data_sha256',
      'generated_at',
    ],
  ];
  const append = (prefix: (string | number)[], outcome: StudyOutcome, best: boolean[] = []) =>
    rows.push([
      ...prefix,
      outcome.lc.lower,
      outcome.lc.upper,
      outcome.r.lower,
      outcome.r.upper,
      outcome.pair?.lower ?? '',
      outcome.pair?.upper ?? '',
      outcome.status,
      outcome.allocationStatus,
      outcome.excludedVoteShare,
      ...[0, 1, 2].map((index) => Number(best[index] ?? false)),
      report.metadata.modelVersion,
      report.metadata.analysisVersion,
      report.metadata.dataVersion,
      report.metadata.pollId,
      report.metadata.geographyMode,
      provenance.sourceGitSha ?? '',
      provenance.analysisSourceSha256,
      provenance.historicalDataSha256,
      provenance.generatedAt,
    ]);
  for (const policy of ['coalition', 'ordinary'] as const) {
    const matrix = report.matrices[policy];
    for (const [index, cell] of matrix.cells.entries())
      append(
        [
          'matrix',
          policy,
          matrix.rows[cell.row].id,
          matrix.columns[cell.column].id,
          matrix.rows[cell.row].label,
          matrix.columns[cell.column].label,
          '',
          '',
          '',
          '',
          'partition',
        ],
        cell.outcome,
        [
          matrix.summary.lc.bestIndices.includes(index),
          matrix.summary.r.bestIndices.includes(index),
          false,
        ],
      );
  }
  for (const study of [...report.pairs, report.concentration]) {
    const pair = 'targetId' in study ? (study as PairStudy) : null;
    for (const [index, point] of study.points.entries())
      append(
        [
          study.id,
          'ordinary',
          '',
          '',
          '',
          '',
          pair?.targetLabel ?? 'A',
          pair?.donorLabel ?? 'B',
          point.xUnits / 1_000_000,
          point.otherUnits / 1_000_000,
          point.kinds.join('|'),
        ],
        point.outcome,
        [
          study.summary.lc.bestIndices.includes(index),
          study.summary.r.bestIndices.includes(index),
          study.summary.pair?.bestIndices.includes(index) ?? false,
        ],
      );
    append(
      [
        study.id,
        pair ? 'coalition' : 'ordinary',
        '',
        '',
        '',
        '',
        pair ? `Wspólna lista: ${pair.targetLabel} + ${pair.donorLabel}` : 'Jedna partia L+C',
        '',
        study.totalUnits / 1_000_000,
        '',
        'pooled-reference',
      ],
      pair ? pair.pooled : report.concentration.oneParty,
    );
  }
  append(
    ['baseline', 'ordinary', '', '', '', '', '', '', '', '', 'published-poll'],
    report.baseline,
  );
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
