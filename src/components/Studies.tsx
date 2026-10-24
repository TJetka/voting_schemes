import { useState, type ReactNode } from 'react';
import type {
  CoalitionMatrixStudy,
  PairStudy,
  SampleExtrema,
  StudyOutcome,
  StudyPoint,
  StudyReport,
} from '../model/studies-types';
import type { CommitteeType } from '../model/types';
import { boundsText, downloadText, number, percent, signed } from './display';
import { StudyOutcomeBar, StudySeatChart, type StudyChartPoint } from './StudiesCharts';
import '../studies.css';

function winner(outcome: StudyOutcome): 'lc' | 'r' | 'tie' {
  return outcome.lc.lower >= 231 ? 'lc' : outcome.r.lower >= 231 ? 'r' : 'tie';
}
function winnerText(outcome: StudyOutcome): string {
  return winner(outcome) === 'lc'
    ? 'Większość L+C'
    : winner(outcome) === 'r'
      ? 'Większość R'
      : outcome.status === 'ambiguous'
        ? 'Wynik nierozstrzygnięty'
        : 'Bez większości 231 mandatów';
}
function chartPoints(points: StudyPoint[]): StudyChartPoint[] {
  return points.map((point) => ({ ...point, ...point.outcome }));
}
function share(units: number): string {
  return percent(units / 1_000_000, 6);
}
function bestSamples(points: StudyPoint[], extrema: SampleExtrema, limit = 5): string {
  const indices = extrema.bestIndices;
  if (!indices.length)
    return 'Brak jednoznacznego maksimum przy nierozstrzygniętej granicy mandatów.';
  if (indices.length <= 12) return indices.map((index) => share(points[index].xUnits)).join('; ');
  const groups: number[][] = [];
  for (const index of indices) {
    const group = groups.at(-1);
    if (group && group.at(-1)! + 1 === index) group.push(index);
    else groups.push([index]);
  }
  const labels = groups
    .slice(0, limit)
    .map((group) =>
      group.length === 1
        ? share(points[group[0]].xUnits)
        : `próbki od ${share(points[group[0]].xUnits)} do ${share(points[group.at(-1)!].xUnits)}`,
    );
  return `${labels.join('; ')}${groups.length > limit ? `; oraz ${groups.length - limit} dalszych zakresów próbek w tabeli` : ''}`;
}
function rangeText(extrema: SampleExtrema): string {
  return extrema.minimum === extrema.maximum
    ? String(extrema.minimum)
    : `${extrema.minimum}–${extrema.maximum}`;
}
function xml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}

/** Standalone matrix figure. All partition labels and the legal policy travel with the exported SVG. */
export function matrixSvg(matrix: CoalitionMatrixStudy, source: string): string {
  const cell = 36;
  const left = 300;
  const top = 400;
  // Rotated column labels extend beyond the last cell; retain room for their full text.
  const width = left + matrix.columns.length * cell + 220;
  const height = top + matrix.rows.length * cell + 100;
  const cells = matrix.cells
    .map(({ row, column, outcome }) => {
      const colour =
        winner(outcome) === 'lc' ? '#d4e9e2' : winner(outcome) === 'r' ? '#f1dcd5' : '#f0e8ce';
      const x = left + column * cell;
      const y = top + row * cell;
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${colour}" stroke="#fffefa"/><text x="${x + cell / 2}" y="${y + 23}" text-anchor="middle" font-size="11" fill="#172b36">${xml(boundsText(outcome.lc))}</text>`;
    })
    .join('');
  const rows = matrix.rows
    .map(
      (row, index) =>
        `<text x="${left - 10}" y="${top + index * cell + 23}" text-anchor="end" font-size="12" fill="#172b36">${xml(`${row.id}: ${row.label}`)}</text>`,
    )
    .join('');
  const columns = matrix.columns
    .map(
      (column, index) =>
        `<text transform="translate(${left + index * cell + cell / 2},${top - 10}) rotate(-65)" font-size="11" fill="#172b36">${xml(`${column.id}: ${column.label}`)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>R kontra L+C: wszystkie układy list</title><desc>Wiersze: układy R. Kolumny: układy L+C. Liczba w komórce: mandaty L+C; R otrzymuje pozostałe mandaty w wynikach rozstrzygniętych.</desc><rect width="100%" height="100%" fill="#fffefa"/><g font-family="Arial,sans-serif"><text x="24" y="34" font-size="24" font-weight="bold" fill="#172b36">R kontra L+C · ${matrix.rows.length} × ${matrix.columns.length} układów</text><text x="24" y="60" font-size="14" fill="#68757a">Wspólne listy: ${matrix.policy === 'coalition' ? 'koalicja 8%' : 'jeden komitet 5%'}. Listy pojedyncze: 5%. ${xml(source)}</text><text x="24" y="90" font-size="14" fill="#172b36">Zielony: większość L+C. Czerwony: większość R. Beżowy: brak pewnej większości. W komórce: mandaty L+C; dla wyniku rozstrzygniętego R = 460 − L+C.</text>${rows}${columns}${cells}<text x="24" y="${height - 55}" font-size="13" fill="#68757a">Stałe poparcie, geografia i frekwencja. Centrum należy do bloku L+C we wszystkich układach.</text><text x="24" y="${height - 30}" font-size="13" fill="#68757a">Model scenariuszowy. Liczba korzystnych układów nie jest prawdopodobieństwem wyniku wyborów.</text></g></svg>`;
}

function MatrixStudy({ report, source }: { report: StudyReport; source: string }) {
  const [policy, setPolicy] = useState<CommitteeType>('coalition');
  const matrix = report.matrices[policy];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = matrix.cells[Math.min(selectedIndex, matrix.cells.length - 1)];
  const selectedRow = matrix.rows[selected.row];
  const selectedColumn = matrix.columns[selected.column];
  const robust = matrix.columnSummaries.filter((column) => column.guaranteedMajority);
  const strongest = matrix.columnSummaries[matrix.maximinLcColumnIndices[0]];
  return (
    <section className="study-section" id="study-matrix" aria-labelledby="study-matrix-heading">
      <header>
        <span className="section-no">01 / KONFIGURACJE</span>
        <h2 id="study-matrix-heading">Ten sam sondaż, {matrix.cells.length} układów list</h2>
        <p>
          Centrum zawsze należy do parlamentarnego bloku L+C. Każdy wiersz to inny podział prawicy,
          każda kolumna — inny podział L+C. Zmieniają się wyłącznie wspólne listy.
        </p>
      </header>
      <div className="study-matrix-controls">
        <label>
          Założenie prawne dla wspólnych list
          <select
            value={policy}
            onChange={(event) => setPolicy(event.target.value as CommitteeType)}
            aria-label="Próg wspólnych list w analizie"
          >
            <option value="coalition">Formalna koalicja — 8%</option>
            <option value="ordinary">Wspólna lista w jednym komitecie — 5%</option>
          </select>
        </label>
        <button
          onClick={() =>
            downloadText(
              `macierz-lc-r-${policy}.svg`,
              matrixSvg(matrix, source),
              'image/svg+xml;charset=utf-8',
            )
          }
        >
          Pobierz macierz SVG
        </button>
      </div>
      <div className="study-stat-grid">
        <div>
          <span>Mandaty L+C</span>
          <strong>{rangeText(matrix.summary.lc)}</strong>
          <small>we wszystkich {matrix.cells.length} układach</small>
        </div>
        <div>
          <span>Mandaty R</span>
          <strong>{rangeText(matrix.summary.r)}</strong>
          <small>przy tym samym poparciu</small>
        </div>
        <div>
          <span>Układy z większością L+C</span>
          <strong>
            {number(matrix.summary.lcMajorities)} <small>/ {matrix.cells.length}</small>
          </strong>
          <small>liczba konfiguracji, nie szansa wyborcza</small>
        </div>
        <div>
          <span>Układy z większością R</span>
          <strong>
            {number(matrix.summary.rMajorities)} <small>/ {matrix.cells.length}</small>
          </strong>
          <small>próg większości: 231 mandatów</small>
        </div>
      </div>
      <p className="study-conclusion">
        <strong>Wniosek.</strong> Sam sposób podziału na listy daje blokowi L+C od{' '}
        {matrix.summary.lc.minimum} do {matrix.summary.lc.maximum} mandatów, bez dopisywania mu
        nowych wyborców. Układ list po obu stronach jest częścią wyniku: pojedynczą kolumnę należy
        czytać razem z konkretnym wierszem.
      </p>
      <div className="study-robust-result">
        <h3>Co pozostaje korzystne przy każdym układzie prawicy?</h3>
        <p>
          <strong>
            {robust.length === 1
              ? 'Jeden układ L+C zachowuje'
              : `${robust.length} układów L+C zachowuje`}{' '}
            większość przy wszystkich {matrix.rows.length} podziałach R.
          </strong>{' '}
          Najlepszy wynik L+C w najmniej korzystnym wierszu wynosi {strongest.minimum} mandatów.
          Osiąga go:{' '}
          {matrix.maximinLcColumnIndices.map((index) => matrix.columns[index].label).join('; ')}. W
          zależności od podziału R ten układ daje od {strongest.minimum} do {strongest.maximum}{' '}
          mandatów L+C.
        </p>
        <p className="small muted">
          To odporność na podział list prawicy przy tym samym sondażu, a nie gwarancja większości w
          przyszłych wyborach.{' '}
          {matrix.summary.noMajority > 0
            ? `${matrix.summary.noMajority} układów daje brak większości żadnego bloku.`
            : ''}{' '}
          {matrix.summary.unresolved > 0
            ? `${matrix.summary.unresolved} układów ma nierozstrzygnięte granice mandatów.`
            : ''}
        </p>
      </div>
      <div className="study-matrix-legend">
        <span className="lc">Większość L+C</span>
        <span className="r">Większość R</span>
        <span className="tie">Brak pewnej większości</span>
        <span>Liczby w komórkach = mandaty L+C</span>
      </div>
      <p className="small muted">
        Przewiń macierz w poziomie. Komórki można wybierać także strzałkami klawiatury. Wybierz
        komórkę, aby zobaczyć obie sumy mandatów i dokładny skład list. Wszystkie{' '}
        {matrix.rows.length} × {matrix.columns.length} podziały są policzone; formy prawne stosujemy
        według jednego wybranego założenia.
      </p>
      <div
        className="study-matrix-scroll"
        tabIndex={0}
        role="region"
        aria-label="Macierz wszystkich konfiguracji, przewijana w poziomie"
      >
        <table className="study-matrix" aria-label="Macierz R kontra L+C">
          <caption className="visually-hidden">
            Wiersze: podziały R. Kolumny: podziały L+C. Komórki podają mandaty L+C.
          </caption>
          <thead>
            <tr>
              <th scope="col">R ↓ / L+C →</th>
              {matrix.columns.map((column) => (
                <th key={column.id} scope="col" title={column.label}>
                  {column.id}
                  <small>{column.groups.length} list</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th scope="row">
                  <strong>{row.id}</strong>
                  <span>{row.label}</span>
                </th>
                {matrix.columns.map((column, columnIndex) => {
                  const index = rowIndex * matrix.columns.length + columnIndex;
                  const outcome = matrix.cells[index].outcome;
                  return (
                    <td key={column.id}>
                      <button
                        className={`${winner(outcome)} ${selectedIndex === index ? 'selected' : ''}`}
                        id={`study-matrix-${policy}-${rowIndex}-${columnIndex}`}
                        tabIndex={selectedIndex === index ? 0 : -1}
                        onClick={() => setSelectedIndex(index)}
                        aria-pressed={selectedIndex === index}
                        onKeyDown={(event) => {
                          const movement: Record<string, number> = {
                            ArrowRight: 1,
                            ArrowLeft: -1,
                            ArrowDown: matrix.columns.length,
                            ArrowUp: -matrix.columns.length,
                          };
                          const delta = movement[event.key];
                          if (delta === undefined) return;
                          event.preventDefault();
                          const next = Math.max(
                            0,
                            Math.min(matrix.cells.length - 1, index + delta),
                          );
                          setSelectedIndex(next);
                          const cell = matrix.cells[next];
                          document
                            .getElementById(`study-matrix-${policy}-${cell.row}-${cell.column}`)
                            ?.focus();
                        }}
                        aria-label={`${row.id}, ${column.id}: L+C ${boundsText(outcome.lc)}, R ${boundsText(outcome.r)}. ${winnerText(outcome)}`}
                        title={`${column.label} / ${row.label}\nL+C ${boundsText(outcome.lc)} : R ${boundsText(outcome.r)}`}
                      >
                        {boundsText(outcome.lc)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="study-matrix-detail" aria-live="polite" data-testid="study-matrix-selection">
        <div>
          <span className="eyebrow">
            WYBRANY UKŁAD · {selectedRow.id} × {selectedColumn.id}
          </span>
          <h3>{winnerText(selected.outcome)}</h3>
          <p>
            <strong>L+C:</strong> {selectedColumn.label}
            <br />
            <strong>R:</strong> {selectedRow.label}
          </p>
        </div>
        <StudyOutcomeBar
          lc={selected.outcome.lc}
          r={selected.outcome.r}
          label="Wynik całych bloków"
        />
      </div>
      <details className="study-details">
        <summary>Pełny klucz kolumn L+C</summary>
        <ol className="study-column-key">
          {matrix.columns.map((column) => (
            <li key={column.id}>
              <strong>{column.id}</strong> {column.label}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function PointsTable({
  points,
  targetLabel,
  donorLabel,
  showPair,
  bestIndices,
}: {
  points: StudyPoint[];
  targetLabel: string;
  donorLabel: string;
  showPair: boolean;
  bestIndices: number[];
}) {
  const best = new Set(bestIndices);
  return (
    <details className="study-details">
      <summary>Wszystkie obliczone próbki ({points.length})</summary>
      <div className="table-scroll study-points-table">
        <table aria-label={`Próbki: ${targetLabel} i ${donorLabel}`}>
          <thead>
            <tr>
              <th>{targetLabel}</th>
              <th>{donorLabel}</th>
              <th>L+C</th>
              <th>R</th>
              {showPair && <th>Badana para</th>}
              <th>Interpretacja</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={point.xUnits} className={best.has(index) ? 'study-best-row' : ''}>
                <td>{share(point.xUnits)}</td>
                <td>{share(point.otherUnits)}</td>
                <td>{boundsText(point.outcome.lc)}</td>
                <td>{boundsText(point.outcome.r)}</td>
                {showPair && <td>{boundsText(point.outcome.pair!)}</td>}
                <td>
                  {best.has(index) && <strong>Najlepsza badana próbka · </strong>}
                  {point.kinds.includes('current') ? 'sondaż · ' : ''}
                  {point.kinds.includes('balanced') ? 'równy podział · ' : ''}
                  {point.kinds.includes('threshold') ? 'dokładny próg · ' : ''}
                  {winnerText(point.outcome)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PairFlowStudy({
  study,
  number: sectionNumber,
  source,
}: {
  study: PairStudy;
  number: number;
  source: string;
}) {
  const current = study.points.find((point) => point.xUnits === study.baselineUnits)!;
  const pairExtrema = study.summary.pair!;
  const blockExtrema = study.block === 'LC' ? study.summary.lc : study.summary.r;
  const best = study.points[pairExtrema.bestIndices[0]];
  return (
    <section
      className="study-section"
      id={`study-${study.id}`}
      aria-labelledby={`study-${study.id}-heading`}
    >
      <header>
        <span className="section-no">0{sectionNumber} / PRZEPŁYW WEWNĄTRZ BLOKU</span>
        <h2 id={`study-${study.id}-heading`}>
          {study.targetLabel} ↔ {study.donorLabel}
        </h2>
        <p>
          Zmieniamy wyłącznie podział ich łącznych {share(study.totalUnits)}. Pozostałe partie
          zachowują głosy, profile okręgowe i osobne listy. Obie badane partie startują osobno z
          progiem 5%.
        </p>
      </header>
      <div className="study-stat-grid">
        <div>
          <span>Blok L+C</span>
          <strong>{rangeText(study.summary.lc)}</strong>
          <small>mandatów w badanych próbkach</small>
        </div>
        <div>
          <span>Blok R</span>
          <strong>{rangeText(study.summary.r)}</strong>
          <small>mandatów w badanych próbkach</small>
        </div>
        <div>
          <span>Najwięcej mandatów badanej pary</span>
          <strong>{pairExtrema.maximum}</strong>
          <small>obecnie: {boundsText(current.outcome.pair!)}</small>
        </div>
      </div>
      <p className="study-conclusion">
        <strong>Wniosek dla całego bloku {study.block === 'LC' ? 'L+C' : 'R'}.</strong> Przy stałej
        sumie głosów tych dwóch partii wynik bloku zmienia się od {blockExtrema.minimum} do{' '}
        {blockExtrema.maximum} mandatów. {study.targetLabel} i {study.donorLabel} uzyskują razem
        najwięcej — {pairExtrema.maximum} — w zbadanych próbkach poparcia {study.targetLabel}:{' '}
        <strong>{bestSamples(study.points, pairExtrema)}</strong>.
      </p>
      <p className="small">
        <strong>Najwyższy wynik całego bloku {study.block === 'LC' ? 'L+C' : 'R'}:</strong>{' '}
        {blockExtrema.maximum} mandatów. Najlepsze zbadane udziały {study.targetLabel}:{' '}
        {bestSamples(study.points, blockExtrema)}. Optimum pary i optimum całego bloku są oceniane
        oddzielnie.
      </p>
      {best && (
        <p className="small">
          Przykładowa najlepsza próbka pary: {study.targetLabel} {share(best.xUnits)} i{' '}
          {study.donorLabel} {share(best.otherUnits)}. Wynik całych bloków:{' '}
          <strong>
            L+C {boundsText(best.outcome.lc)} : R {boundsText(best.outcome.r)}
          </strong>
          . To zmiana liczby mandatów badanej pary o{' '}
          {signed(pairExtrema.maximum - current.outcome.pair!.lower)} względem sondażu; zysk pary
          nie musi w całości przypaść jej blokowi.
        </p>
      )}
      <StudySeatChart
        points={chartPoints(study.points)}
        title={`${study.targetLabel} ↔ ${study.donorLabel}: wynik bloków`}
        targetLabel={study.targetLabel}
        donorLabel={study.donorLabel}
        source={source}
        filename={`${study.id}-bloki.svg`}
        currentUnits={study.baselineUnits}
      />
      <StudySeatChart
        points={chartPoints(study.points)}
        title={`${study.targetLabel} + ${study.donorLabel}: mandaty pary`}
        targetLabel={study.targetLabel}
        donorLabel={study.donorLabel}
        source={source}
        filename={`${study.id}-para.svg`}
        currentUnits={study.baselineUnits}
        pairOnly
      />
      <div className="study-benchmark">
        <h3>Wspólna lista jako punkt odniesienia</h3>
        <p>
          Wspólna lista tej pary, przy tych samych głosach i formalnym progu 8%, dostaje{' '}
          <strong>{boundsText(study.pooled.pair!)}</strong> mandatów. Podział poparcia między jej
          członków nie zmienia tej sumy.
        </p>
        <StudyOutcomeBar
          lc={study.pooled.lc}
          r={study.pooled.r}
          label="Para na wspólnej liście 8%"
        />
      </div>
      <p className="small muted">
        Obie osobne listy kwalifikują się, gdy {study.targetLabel} ma od 5% do{' '}
        {share(study.totalUnits - 5_000_000)}. Próbkowanie: co{' '}
        {number(study.stepUnits / 1_000_000, 2)} p.p. od obu końców zakresu, dodatkowo sondaż oraz
        dokładne progi i ich najbliżsi sąsiedzi. Zakresy najlepszych próbek nie dowodzą stałego
        wyniku między punktami.
      </p>
      <PointsTable
        points={study.points}
        targetLabel={study.targetLabel}
        donorLabel={study.donorLabel}
        showPair
        bestIndices={pairExtrema.bestIndices}
      />
    </section>
  );
}

export default function Studies({
  report,
  exportActions,
}: {
  report: StudyReport;
  exportActions?: ReactNode;
}) {
  const concentration = report.concentration;
  const balanced = concentration.points.find((point) => point.kinds.includes('balanced'));
  const smallBelow = concentration.points.find((point) => point.xUnits === 2_500_000);
  const smallQualified = concentration.points.find((point) => point.xUnits === 5_000_000);
  const source = `${report.metadata.pollster} ${report.metadata.fieldworkStart}–${report.metadata.fieldworkEnd} · model ${report.metadata.modelVersion}`;
  return (
    <article className="studies" aria-labelledby="studies-heading">
      <header className="studies-intro">
        <div>
          <span className="eyebrow">RAPORT / PIĘĆ EKSPERYMENTÓW</span>
          <h1 id="studies-heading">Jak podział głosów zmienia większość?</h1>
          <p className="studies-lead">
            Te same elektoraty, inne listy. W każdym eksperymencie najpierw patrzymy na końcowy
            wynik dwóch bloków: <strong>L+C oraz R</strong>.
          </p>
        </div>
        <div className="studies-frozen-note">
          <strong>Stała baza raportu</strong>
          <span>
            Pollster · {report.metadata.fieldworkStart}–{report.metadata.fieldworkEnd} · n ={' '}
            {number(report.metadata.sampleSize)}
          </span>
          <span>Geografia grup z 2023 r. · model {report.metadata.modelVersion}</span>
          <small>
            Ten raport używa opublikowanego sondażu. Edycje w laboratorium nie zmieniają poniższych
            analiz.
          </small>
        </div>
        <StudyOutcomeBar
          lc={report.baseline.lc}
          r={report.baseline.r}
          label="Punkt wyjścia: wszystkie podmioty osobno"
        />
        <p className="study-intro-takeaway">
          <strong>Ten sam sondaż może dać innego zwycięzcę.</strong> Przy osobnych listach wynik
          wynosi L+C {boundsText(report.baseline.lc)} : R {boundsText(report.baseline.r)}. Jedna
          wspólna partia L+C, przy niezmienionych osobnych listach R, daje L+C{' '}
          {boundsText(concentration.oneParty.lc)} : R {boundsText(concentration.oneParty.r)}. Pełna
          macierz sprawdza także wszystkie podziały prawicy.
        </p>
        <div className="study-export-actions">
          {exportActions}
          <button onClick={() => window.print()}>Drukuj / zapisz PDF</button>
        </div>
      </header>
      <nav className="studies-nav" aria-label="Analizy raportu">
        <a href="#study-matrix">01 · Macierz koalicji</a>
        {report.pairs.map((pair, index) => (
          <a href={`#study-${pair.id}`} key={pair.id}>
            0{index + 2} · {pair.targetLabel} / {pair.donorLabel}
          </a>
        ))}
        <a href="#study-lc-concentration">05 · Jedna czy dwie partie L+C?</a>
      </nav>
      <div className="study-reading-note">
        <strong>Jak czytać wyniki.</strong> L+C to wspólny blok parlamentarny, także gdy centrum
        startuje osobno. R to cały blok prawicy. Do większości potrzeba 231 z 460 mandatów. Nie
        zakładamy odpływu ani dodatkowej mobilizacji po połączeniu list. To model scenariuszowy, nie
        prognoza wyborów.
      </div>
      <MatrixStudy report={report} source={source} />
      {report.pairs.map((pair, index) => (
        <PairFlowStudy key={pair.id} study={pair} number={index + 2} source={source} />
      ))}
      <section
        className="study-section"
        id="study-lc-concentration"
        aria-labelledby="study-lc-concentration-heading"
      >
        <header>
          <span className="section-no">05 / KONCENTRACJA BLOKU L+C</span>
          <h2 id="study-lc-concentration-heading">Jedna duża partia czy dwie mniejsze?</h2>
          <p>
            Całe {share(concentration.totalUnits)} wyborców L+C pozostaje w tym bloku. Prawica
            startuje w niezmienionym układzie osobnych list. Porównujemy punkt wyjścia, jedną partię
            L+C oraz dwie hipotetyczne partie z progiem 5% każda.
          </p>
        </header>
        <div className="study-concentration-comparison">
          <StudyOutcomeBar
            lc={concentration.defaultOutcome.lc}
            r={concentration.defaultOutcome.r}
            label="Sondaż: obecne podmioty L+C osobno"
          />
          <StudyOutcomeBar
            lc={concentration.oneParty.lc}
            r={concentration.oneParty.r}
            label="Cały blok L+C jako jedna partia"
          />
          {smallBelow && (
            <StudyOutcomeBar
              lc={smallBelow.outcome.lc}
              r={smallBelow.outcome.r}
              label={`Mała partia poniżej progu: ${share(smallBelow.xUnits)} + ${share(smallBelow.otherUnits)}`}
            />
          )}
          {smallQualified && (
            <StudyOutcomeBar
              lc={smallQualified.outcome.lc}
              r={smallQualified.outcome.r}
              label={`Mała partia na progu: ${share(smallQualified.xUnits)} + ${share(smallQualified.otherUnits)}`}
            />
          )}
          {balanced && (
            <StudyOutcomeBar
              lc={balanced.outcome.lc}
              r={balanced.outcome.r}
              label={`Dwie równe partie: ${share(balanced.xUnits)} + ${share(balanced.otherUnits)}`}
            />
          )}
        </div>
        <p className="study-conclusion">
          <strong>Wniosek.</strong> Jedna partia L+C uzyskuje{' '}
          <strong>{boundsText(concentration.oneParty.lc)}</strong> mandatów, wobec{' '}
          {boundsText(concentration.defaultOutcome.lc)} przy obecnym podziale. W badanych podziałach
          na dwie partie wynik L+C wynosi <strong>{rangeText(concentration.summary.lc)}</strong>.
          Najlepsze zbadane udziały Partii A:{' '}
          <strong>{bestSamples(concentration.points, concentration.summary.lc)}</strong>.
        </p>
        <p>
          Dwie hipotetyczne partie dzielą ten sam połączony elektorat regionalny L+C proporcjonalnie
          w każdym okręgu. Izolujemy podział głosów i progi. Nie przypisujemy nowych partii do
          konkretnych liderów ani istniejących organizacji.
        </p>
        <StudySeatChart
          points={chartPoints(concentration.points)}
          title="Dwie partie L+C: wynik całych bloków"
          targetLabel="Partia A"
          donorLabel="Partia B"
          source={source}
          filename="lc-dwie-partie.svg"
        />
        <p className="small muted">
          Siatka co {number(concentration.stepUnits / 1_000_000, 2)} p.p. od obu końców zakresu oraz
          dokładny równy podział, końce i progi. Udział 0% oznacza zerową listę: wszystkie głosy ma
          druga partia. Obie listy kwalifikują się, gdy Partia A ma od 5% do{' '}
          {share(concentration.totalUnits - 5_000_000)}. Schodki łączą obliczone próbki; przejście
          między nimi może wystąpić wcześniej.
        </p>
        <PointsTable
          points={concentration.points}
          targetLabel="Partia A"
          donorLabel="Partia B"
          showPair={false}
          bestIndices={concentration.summary.lc.bestIndices}
        />
      </section>
      <footer className="study-methods">
        <h2>Zakres interpretacji i źródła</h2>
        <p>
          Wyniki są deterministycznym porównaniem założeń. „Najlepszy” oznacza najwyższą liczbę
          mandatów w policzonych konfiguracjach lub próbkach, nie rekomendację polityczną ani
          oszacowanie szans. W macierzy enumerujemy wszystkie podziały, w przepływach badamy
          zadeklarowaną siatkę. Przedziały mandatów oznaczają nierozstrzygniętą granicę.
        </p>
        <ul>
          {report.metadata.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
        <p>
          Model {report.metadata.modelVersion} · dane {report.metadata.dataVersion} · analiza{' '}
          {report.metadata.analysisVersion}. Mandaty: 41 okręgów i 460 miejsc z 2023 r. Sondaż
          opublikowano {report.metadata.publicationDate}.
        </p>
        <p>
          {report.metadata.sourceUrls.map((url, index) => (
            <span key={url}>
              {index > 0 ? ' · ' : ''}
              <a href={url} target="_blank" rel="noreferrer">
                Źródło {index + 1}
              </a>
            </span>
          ))}
        </p>
      </footer>
    </article>
  );
}
