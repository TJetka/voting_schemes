import { useEffect, useMemo, useRef, useState } from 'react';
import { majorityLabel, type AllianceRule } from '../model/alliances';
import {
  listFamily,
  mergeEntities,
  partitionLists,
  scenarioFingerprint,
} from '../model/coalitions';
import { parseSupport } from '../model/support';
import {
  scenarioAt,
  type Axis,
  type HeatOutput,
  type SweepOutput,
  type SweepPoint,
} from '../model/sensitivity';
import type { CommitteeType, Scenario } from '../model/types';
import {
  isCurrentResponse,
  type ConfigurationRow,
  type Job,
  type WorkerResponse,
} from '../workers/protocol';

interface Props {
  scenario: Scenario;
  onOpenScenario: (scenario: Scenario) => void;
  onInspectDistrict: (id: number) => void;
  mode: 'exhaustive' | 'sensitivity';
}
const rules: AllianceRule[] = ['L', 'R', 'L+C', 'R+C'];
const ruleLabels: Record<AllianceRule, string> = {
  L: 'Listy grupy L',
  R: 'Listy grupy R',
  'L+C': 'L + wszystkie listy centrum',
  'R+C': 'R + wszystkie listy centrum',
};
const pct = (units: number) => (units / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 6 });
const boundsText = (bounds: { lower: number; upper: number }) =>
  bounds.lower === bounds.upper ? String(bounds.lower) : `${bounds.lower}–${bounds.upper}`;
interface AxisInput {
  targetId: string;
  donorId: string;
  min: string;
  max: string;
  step: string;
}
const parseAxis = (axis: AxisInput): Axis => ({
  ...axis,
  min: parseSupport(axis.min),
  max: parseSupport(axis.max),
  step: parseSupport(axis.step),
});

function AxisEditor({
  title,
  value,
  onChange,
  scenario,
}: {
  title: string;
  value: AxisInput;
  onChange: (value: AxisInput) => void;
  scenario: Scenario;
}) {
  const entities = scenario.entities.filter((entity) => entity.active);
  return (
    <fieldset className="axis-editor">
      <legend>{title}</legend>
      <label>
        Cel
        <select
          value={value.targetId}
          onChange={(event) => onChange({ ...value, targetId: event.target.value })}
        >
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Dawca
        <select
          value={value.donorId}
          onChange={(event) => onChange({ ...value, donorId: event.target.value })}
        >
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.label}
            </option>
          ))}
        </select>
      </label>
      {(['min', 'max', 'step'] as const).map((key) => (
        <label key={key}>
          {{ min: 'Od (%)', max: 'Do (%)', step: 'Krok (p.p.)' }[key]}
          <input
            inputMode="decimal"
            aria-label={`${title}: ${key}`}
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function StepChart({
  points,
  title,
  getValue,
  majority = true,
}: {
  points: SweepPoint[];
  title: string;
  getValue: (point: SweepPoint) => number;
  majority?: boolean;
}) {
  if (!points.length) return null;
  const low = points[0].x,
    high = points.at(-1)!.x;
  const max = majority
    ? Math.max(250, ...points.map(getValue))
    : Math.max(10, ...points.map(getValue));
  const x = (value: number) => 42 + ((value - low) / Math.max(1, high - low)) * 540;
  const y = (value: number) => 176 - (value / max) * 150;
  let path = `M${x(low)},${y(getValue(points[0]))}`;
  for (const point of points.slice(1)) path += `H${x(point.x)}V${y(getValue(point))}`;
  return (
    <figure className="step-chart">
      <figcaption>{title}</figcaption>
      <svg viewBox="0 0 620 215" role="img" aria-label={`${title}. Wartości tabelaryczne poniżej.`}>
        <path d="M42 20V176H590" fill="none" stroke="#b8c3c1" />
        {majority && (
          <>
            <path d={`M42 ${y(231)}H590`} stroke="#9b5e37" strokeDasharray="5 5" />
            <text x="585" y={y(231) - 5} textAnchor="end">
              231
            </text>
          </>
        )}
        <path d={path} fill="none" stroke="#137b78" strokeWidth="2.5" />
        <text x="8" y="30">
          {max}
        </text>
        <text x="20" y="180">
          0
        </text>
        <text x="42" y="201">
          {pct(low)}%
        </text>
        <text x="582" y="201" textAnchor="end">
          {pct(high)}%
        </text>
      </svg>
    </figure>
  );
}

export default function Exploration({ scenario, onOpenScenario, onInspectDistrict, mode }: Props) {
  const [policy, setPolicy] = useState<CommitteeType>('coalition');
  const [rule, setRule] = useState<AllianceRule>('L');
  const [xAxis, setXAxis] = useState<AxisInput>({
    targetId: 'razem',
    donorId: 'nl',
    min: '4.5',
    max: '5.5',
    step: '0.01',
  });
  const [yAxis, setYAxis] = useState<AxisInput>({
    targetId: 'rozwoj',
    donorId: 'pis',
    min: '4',
    max: '6',
    step: '0.1',
  });
  const [heatX, setHeatX] = useState<AxisInput>({
    targetId: 'razem',
    donorId: 'nl',
    min: '4',
    max: '6',
    step: '0.1',
  });
  const [refinement, setRefinement] = useState(false);
  const [merged, setMerged] = useState(false);
  const [response, setResponse] = useState<Extract<WorkerResponse, { type: 'done' }> | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const cache = useRef(new Map<string, Extract<WorkerResponse, { type: 'done' }>>());
  const fingerprint = scenarioFingerprint(scenario);
  const controlKey = JSON.stringify([
    fingerprint,
    policy,
    rule,
    xAxis,
    yAxis,
    heatX,
    refinement,
    merged,
    mode,
  ]);
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    request.current += 1;
    setProgress(null);
    setResponse(null);
    setError('');
    return () => {
      worker.current?.terminate();
    };
  }, [controlKey]);

  function start(kind: Job['kind']) {
    try {
      worker.current?.terminate();
      const sample =
        merged && kind === 'sweep'
          ? mergeEntities(scenario, ['nl', 'razem'], 'coalition')
          : scenario;
      const job: Job =
        kind === 'exhaustive'
          ? { kind, scenario, policy }
          : kind === 'sweep'
            ? { kind, scenario: sample, axis: parseAxis(xAxis), rule }
            : {
                kind,
                scenario,
                xAxis: parseAxis(heatX),
                yAxis: parseAxis(yAxis),
                rule,
                refinement,
              };
      const key = JSON.stringify(job);
      setError('');
      setResponse(null);
      const cached = cache.current.get(key);
      if (cached) {
        setProgress(null);
        setResponse(cached);
        return;
      }
      const requestId = ++request.current;
      const instance = new Worker(new URL('../workers/explorer.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      setProgress({ completed: 0, total: 1 });
      instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data;
        if (!isCurrentResponse(data, request.current, fingerprint)) return;
        if (data.type === 'progress') setProgress(data);
        else {
          setProgress(null);
          instance.terminate();
          worker.current = null;
          if (data.type === 'error') setError(data.message);
          else {
            setResponse(data);
            if (cache.current.size >= 4) cache.current.delete(cache.current.keys().next().value!);
            cache.current.set(key, data);
          }
        }
      };
      instance.onerror = (event) => {
        setError(
          `Błąd obliczeń: ${event.message || 'Nie można uruchomić modułu obliczeń. Odśwież stronę po aktualizacji aplikacji.'}`,
        );
        setProgress(null);
        instance.terminate();
      };
      instance.postMessage({ requestId, fingerprint, job });
    } catch (exception) {
      setProgress(null);
      setError(exception instanceof Error ? exception.message : String(exception));
    }
  }
  const cancel = () => {
    request.current += 1;
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setError('Obliczenia anulowano.');
  };
  const sampleScenario = (output: SweepOutput, point: SweepPoint) =>
    scenarioAt(
      merged ? mergeEntities(scenario, ['nl', 'razem'], 'coalition') : scenario,
      output.axis,
      point.x,
    );
  return (
    <section className="exploration panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {mode === 'exhaustive' ? 'Pełny przegląd układów' : 'Przetestuj granice wyniku'}
          </p>
          <h2>
            {mode === 'exhaustive' ? 'Te same głosy. Różne listy.' : 'Gdzie zmienia się mandat?'}
          </h2>
        </div>
      </div>
      <label className="rule-picker">
        Porównywany sojusz
        <select value={rule} onChange={(event) => setRule(event.target.value as AllianceRule)}>
          {rules.map((item) => (
            <option key={item} value={item}>
              {ruleLabels[item]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Centrum dołączone do przeciwnego obozu nie jest dodawane ponownie. To alternatywne założenia
        o większości parlamentarnej.
      </p>
      {mode === 'exhaustive' ? (
        <>
          <div className="toolbar">
            <label>
              Polityka wspólnych list
              <select
                value={policy}
                onChange={(event) => setPolicy(event.target.value as CommitteeType)}
              >
                <option value="coalition">Każda wspólna lista: formalna koalicja 8%</option>
                <option value="ordinary">Każda wspólna lista: jeden komitet 5%</option>
              </select>
            </label>
            <button className="primary" onClick={() => start('exhaustive')} disabled={!!progress}>
              Porównaj wszystkie konfiguracje
            </button>
          </div>
          <p className="muted">
            Jednoosobowe listy: 5%. Stałe poparcie i geografia; porównujemy grupowania, a nie każdą
            niezależną kombinację form prawnych.
          </p>
        </>
      ) : (
        <>
          <details open>
            <summary>Eksperyment jednowymiarowy</summary>
            <AxisEditor title="Oś 1D" value={xAxis} onChange={setXAxis} scenario={scenario} />
            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={merged}
                  onChange={(event) => setMerged(event.target.checked)}
                />{' '}
                Porównaj wariant NL + Razem (8%)
              </label>
              <button onClick={() => setXAxis({ ...xAxis, step: '0.001' })}>
                Dokładność 0,001 p.p.
              </button>
              <button className="primary" disabled={!!progress} onClick={() => start('sweep')}>
                Oblicz wrażliwość 1D
              </button>
            </div>
            <p className="muted">
              Maks. 2001 próbek, włącznie z dokładnymi progami i sąsiadami ±0,000001 p.p. Każda
              próbka zaczyna od tego samego scenariusza. Przejścia okręgowe pozostają przedziałami.
            </p>
          </details>
          <details>
            <summary>Dwuwymiarowa mapa większości</summary>
            <AxisEditor title="Oś X mapy" value={heatX} onChange={setHeatX} scenario={scenario} />
            <AxisEditor title="Oś Y mapy" value={yAxis} onChange={setYAxis} scenario={scenario} />
            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={refinement}
                  onChange={(event) => setRefinement(event.target.checked)}
                />{' '}
                Lokalna analiza: limit 101 × 101 zamiast 41 × 41
              </label>
              <button className="primary" disabled={!!progress} onClick={() => start('heat')}>
                Oblicz mapę 2D
              </button>
            </div>
            <p className="muted">
              Cele i dawcy muszą być rozłączne. Ujemne poparcie pozostaje nieprawidłową komórką.
              Granic między komórkami nie wygładzamy.
            </p>
          </details>
        </>
      )}
      {progress && (
        <div className="calculation-status" role="status">
          <progress value={progress.completed} max={progress.total} /> {progress.completed} /{' '}
          {progress.total}
          <button onClick={cancel}>Anuluj obliczenia</button>
        </div>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {response && (
        <p className="muted">
          Czas obliczeń: {(response.elapsedMs / 1000).toFixed(2)} s. Dane: {scenario.dataVersion};
          model: {scenario.modelVersion}.
        </p>
      )}
      {response?.kind === 'exhaustive' && (
        <ConfigurationResults
          rows={response.rows}
          scenario={scenario}
          rule={rule}
          policy={policy}
          onOpenScenario={onOpenScenario}
        />
      )}
      {response?.kind === 'sweep' && (
        <SweepResults
          output={response.output}
          rule={rule}
          onOpen={(point) => onOpenScenario(sampleScenario(response.output, point))}
          onDistrict={(id, x) => {
            const point = response.output.points.find((item) => item.x === x)!;
            onOpenScenario(sampleScenario(response.output, point));
            onInspectDistrict(id);
          }}
        />
      )}
      {response?.kind === 'heat' && (
        <HeatResults
          output={response.output}
          selected={selectedCell}
          onSelect={setSelectedCell}
          onOpen={(x, y) =>
            onOpenScenario(
              scenarioAt(scenarioAt(scenario, response.output.xAxis, x), response.output.yAxis, y),
            )
          }
          onRefine={() => {
            if (!selectedCell) return;
            const local = (axis: AxisInput, centre: number): AxisInput => {
              const parsed = parseAxis(axis);
              const step = Math.max(1, Math.floor(parsed.step / 5));
              return {
                ...axis,
                min: String(Math.max(0, centre - 2 * parsed.step) / 1e6),
                max: String(Math.min(100_000_000, centre + 2 * parsed.step) / 1e6),
                step: String(step / 1e6),
              };
            };
            setHeatX(local(heatX, selectedCell.x));
            setYAxis(local(yAxis, selectedCell.y));
            setRefinement(true);
          }}
        />
      )}
    </section>
  );
}

function ConfigurationResults({
  rows,
  scenario,
  rule,
  policy,
  onOpenScenario,
}: {
  rows: ConfigurationRow[];
  scenario: Scenario;
  rule: AllianceRule;
  policy: CommitteeType;
  onOpenScenario: (scenario: Scenario) => void;
}) {
  const [eligible, setEligible] = useState('');
  const [running, setRunning] = useState('');
  const [majority, setMajority] = useState('');
  const [first, setFirst] = useState('nl');
  const [second, setSecond] = useState('razem');
  const [together, setTogether] = useState('');
  const [centre, setCentre] = useState('');
  const [sort, setSort] = useState('seats-desc');
  const [page, setPage] = useState(0);
  const describe = (row: ConfigurationRow) =>
    row.partition
      .map((block) =>
        block.map((id) => scenario.entities.find((entity) => entity.id === id)!.label).join(' + '),
      )
      .join(' | ');
  const filtered = useMemo(
    () =>
      rows
        .filter((row) => {
          const bounds = row.rules[rule];
          if (
            (eligible && row.eligibleCount !== Number(eligible)) ||
            (running && row.runningCount !== Number(running))
          )
            return false;
          if (
            (majority === 'yes' && bounds.lower < 231) ||
            (majority === 'no' && bounds.upper >= 231) ||
            (majority === 'ambiguous' && !(bounds.lower < 231 && bounds.upper >= 231))
          )
            return false;
          const same = row.partition.some(
            (block) => block.includes(first) && block.includes(second),
          );
          if ((together === 'yes' && !same) || (together === 'no' && same)) return false;
          if (centre) {
            const centreLists = partitionLists(row.partition, policy).filter((list) =>
              list.memberEntityIds.some(
                (id) => scenario.entities.find((entity) => entity.id === id)!.family === 'C',
              ),
            );
            if (!centreLists.every((list) => listFamily(list, scenario.entities) === centre))
              return false;
          }
          return true;
        })
        .sort((a, b) =>
          sort === 'seats-asc'
            ? a.rules[rule].lower - b.rules[rule].lower
            : sort === 'eligible'
              ? a.eligibleCount - b.eligibleCount
              : sort === 'running'
                ? a.runningCount - b.runningCount
                : b.rules[rule].lower - a.rules[rule].lower,
        ),
    [
      rows,
      scenario,
      rule,
      policy,
      eligible,
      running,
      majority,
      first,
      second,
      together,
      centre,
      sort,
    ],
  );
  useEffect(
    () => setPage(0),
    [eligible, running, majority, first, second, together, centre, sort, rule],
  );
  const outcomes = new Map<number, { resolved: Set<number>; ambiguous: Set<string> }>();
  for (const row of filtered) {
    if (!outcomes.has(row.eligibleCount))
      outcomes.set(row.eligibleCount, { resolved: new Set(), ambiguous: new Set() });
    const entry = outcomes.get(row.eligibleCount)!;
    const bounds = row.rules[rule];
    if (bounds.lower === bounds.upper) entry.resolved.add(bounds.lower);
    else entry.ambiguous.add(boundsText(bounds));
  }
  const open = (row: ConfigurationRow) =>
    onOpenScenario({
      ...structuredClone(scenario),
      lists: partitionLists(row.partition, policy),
      allianceSelection: [],
      notes: [
        ...scenario.notes,
        'Otworzono konkretną konfigurację z porównania. Wybierz sojusz parlamentarnego poparcia.',
      ].slice(-50),
    });
  const winning = filtered.filter((row) => row.rules[rule].lower >= 231).length;
  return (
    <>
      <div className="explorer-metrics">
        <strong>{rows.length.toLocaleString('pl-PL')} konfiguracji</strong>
        <span>{filtered.length} po filtrach</span>
        <span>
          {winning} z większością ·{' '}
          {filtered.length ? ((100 * winning) / filtered.length).toFixed(1) : 0}% konfiguracji, nie
          prawdopodobieństwo
        </span>
      </div>
      <div className="explorer-filters">
        <label>
          Listy uprawnione
          <input
            type="number"
            min="0"
            max="10"
            value={eligible}
            onChange={(event) => setEligible(event.target.value)}
            placeholder="Wszystkie"
          />
        </label>
        <label>
          Listy startujące
          <input
            type="number"
            min="1"
            max="10"
            value={running}
            onChange={(event) => setRunning(event.target.value)}
            placeholder="Wszystkie"
          />
        </label>
        <label>
          Większość
          <select value={majority} onChange={(event) => setMajority(event.target.value)}>
            <option value="">Wszystkie</option>
            <option value="yes">Co najmniej 231</option>
            <option value="no">Poniżej 231</option>
            <option value="ambiguous">Nierozstrzygnięta</option>
          </select>
        </label>
        <label>
          Centrum
          <select value={centre} onChange={(event) => setCentre(event.target.value)}>
            <option value="">Dowolnie</option>
            <option value="C">Wszystkie niezwiązane</option>
            <option value="L">Wszystkie w listach L</option>
            <option value="R">Wszystkie w listach R</option>
          </select>
        </label>
        <label>
          Podmiot A
          <select value={first} onChange={(event) => setFirst(event.target.value)}>
            {scenario.entities
              .filter((entity) => entity.active)
              .map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Podmiot B
          <select value={second} onChange={(event) => setSecond(event.target.value)}>
            {scenario.entities
              .filter((entity) => entity.active)
              .map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Relacja A i B
          <select value={together} onChange={(event) => setTogether(event.target.value)}>
            <option value="">Dowolna</option>
            <option value="yes">Razem</option>
            <option value="no">Osobno</option>
          </select>
        </label>
        <label>
          Sortuj
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="seats-desc">Mandaty malejąco</option>
            <option value="seats-asc">Mandaty rosnąco</option>
            <option value="eligible">Uprawnione listy</option>
            <option value="running">Startujące listy</option>
          </select>
        </label>
      </div>
      <figure className="scatter-chart">
        <figcaption>
          Liczba uprawnionych list a mandaty: {ruleLabels[rule]}. Punkt otwiera konfigurację.
        </figcaption>
        <svg
          viewBox="0 0 900 350"
          role="img"
          aria-label="Wykres konfiguracji; te same wartości i działania w tabeli poniżej."
        >
          {[0, 100, 231, 350, 460].map((value) => (
            <g key={value}>
              <line
                x1="50"
                x2="875"
                y1={310 - (value / 460) * 280}
                y2={310 - (value / 460) * 280}
                stroke={value === 231 ? '#ad653d' : '#dce3df'}
                strokeDasharray={value === 231 ? '5 4' : undefined}
              />
              <text x="10" y={314 - (value / 460) * 280}>
                {value}
              </text>
            </g>
          ))}
          {Array.from({ length: 11 }, (_, number) => (
            <text key={number} x={60 + number * 79} y="335" textAnchor="middle">
              {number}
            </text>
          ))}
          {filtered.map((row, index) => (
            <circle
              key={row.partition.map((block) => block.join('+')).join('|')}
              cx={60 + row.eligibleCount * 79 + (((index * 17) % 13) - 6) * 1.3}
              cy={310 - (row.rules[rule].lower / 460) * 280}
              r="3.5"
              fill={
                row.rules[rule].lower >= 231
                  ? '#137b78'
                  : row.rules[rule].upper >= 231
                    ? '#b79c36'
                    : '#c17b55'
              }
              opacity="0.55"
              onClick={() => open(row)}
            >
              <title>
                {describe(row)} · {boundsText(row.rules[rule])} mandatów · L {row.campSeats.L}, R{' '}
                {row.campSeats.R}, C {row.campSeats.C} · wykluczone{' '}
                {row.excludedVoteShare.toFixed(2)}% · {policy === 'coalition' ? '8%' : '5%'}
              </title>
            </circle>
          ))}
        </svg>
      </figure>
      <p className="muted">
        Poziome przesunięcie punktów służy czytelności. Liczba uprawnionych list jest wynikiem
        grupowania, a nie osobnym parametrem przyczynowym.
      </p>
      <details>
        <summary>Zakresy i pełne zbiory wyników dla liczby uprawnionych list</summary>
        {[...outcomes]
          .sort(([a], [b]) => a - b)
          .map(([count, seats]) => {
            const values = [...seats.resolved].sort((a, b) => a - b);
            return (
              <p key={count}>
                <strong>
                  {count} list ·{' '}
                  {values.length
                    ? `${values[0]}–${values.at(-1)} mandatów`
                    : 'brak rozstrzygniętych wyników'}
                  :
                </strong>{' '}
                {values.join(', ')}
                {seats.ambiguous.size > 0 && (
                  <span>
                    {' '}
                    · Konserwatywne przedziały nierozstrzygnięć (nie zbiór osiągalnych wartości):{' '}
                    {[...seats.ambiguous].join('; ')}
                  </span>
                )}
              </p>
            );
          })}
        <p className="muted">
          Pełny zbiór dotyczy rozstrzygniętych konfiguracji. Przedziały numeryczne nie dowodzą
          osiągalności każdej wartości pośredniej.
        </p>
      </details>
      <div className="table-scroll">
        <table>
          <caption>Konfiguracje · {ruleLabels[rule]}</caption>
          <thead>
            <tr>
              <th>Układ list</th>
              <th>Start / próg</th>
              <th>L / R / C</th>
              <th>Głosy na nieuprawnione</th>
              <th>Mandaty sojuszu</th>
              <th>Działanie</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 50, page * 50 + 50).map((row) => (
              <tr key={row.partition.map((block) => block.join('+')).join('|')}>
                <td>{describe(row)}</td>
                <td>
                  {row.runningCount} / {row.eligibleCount}
                </td>
                <td>
                  {row.campSeats.L} / {row.campSeats.R} / {row.campSeats.C}
                </td>
                <td>{row.excludedVoteShare.toFixed(2)}%</td>
                <td>
                  <strong>{boundsText(row.rules[rule])}</strong>
                </td>
                <td>
                  <button onClick={() => open(row)}>Otwórz układ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Poprzednie 50
        </button>
        <span>
          Strona {page + 1} / {Math.max(1, Math.ceil(filtered.length / 50))}
        </span>
        <button disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>
          Następne 50
        </button>
      </div>
    </>
  );
}

function SweepResults({
  output,
  rule,
  onOpen,
  onDistrict,
}: {
  output: SweepOutput;
  rule: AllianceRule;
  onOpen: (point: SweepPoint) => void;
  onDistrict: (id: number, x: number) => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <>
      <p>
        <strong>{output.points.length} próbek</strong> · {pct(output.axis.min)}–
        {pct(output.axis.max)}% · krok {pct(output.axis.step)} p.p. + dokładne progi. Dawca:{' '}
        {output.axis.donorId}.
      </p>
      <div className="step-charts">
        <StepChart
          points={output.points}
          title="Mandaty listy wybranego podmiotu"
          getValue={(point) => point.selectedList.lower}
        />
        <StepChart
          points={output.points}
          title={`Mandaty grupy ${rule.startsWith('L') ? 'L' : 'R'}`}
          getValue={(point) => point.campSeats[rule.startsWith('L') ? 'L' : 'R']}
        />
        <StepChart
          points={output.points}
          title={`Sojusz porównania: ${ruleLabels[rule]}`}
          getValue={(point) => point.alliance.lower}
        />
        <StepChart
          points={output.points}
          title="Sojusz zaznaczony w edytorze"
          getValue={(point) => point.selectedAlliance.lower}
        />
        <StepChart
          points={output.points}
          title="Liczba list uprawnionych"
          getValue={(point) => point.eligibleCount}
          majority={false}
        />
      </div>
      <p className="muted">
        Wykresy pokazują dolne granice, jeśli pojawiła się niejednoznaczność. Dokładne przedziały są
        w tabeli. Pierwsza próbka z większością nie oznacza dokładnego minimalnego przesunięcia
        poparcia.
      </p>
      <details open>
        <summary>Dziennik przejść ({output.transitions.length})</summary>
        <div className="transition-log">
          {output.transitions.map((transition, index) => (
            <article key={index}>
              <strong>
                {transition.exactThreshold
                  ? 'Dokładne przejście progu krajowego'
                  : 'Przedział próbkowania'}
                : {pct(transition.from)}% → {pct(transition.to)}%
              </strong>
              <p>
                Nowe uprawnienia: {transition.gainedEligibility.join(', ') || 'brak'}; utrata:{' '}
                {transition.lostEligibility.join(', ') || 'brak'}. Sojusz:{' '}
                {boundsText(transition.before)} → {boundsText(transition.after)}.{' '}
                {majorityLabel(transition.after)}.
              </p>
              <div className="transition-districts">
                {transition.districts.map((district) => (
                  <button key={district.id} onClick={() => onDistrict(district.id, transition.to)}>
                    Okręg {district.id}:{' '}
                    {Object.entries(district.transfers)
                      .map(([id, delta]) => `${id} ${delta > 0 ? '+' : ''}${delta}`)
                      .join(', ') || 'zmiana granic'}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </details>
      <div className="table-scroll">
        <table>
          <caption>Próbki wrażliwości; wybór odtwarza pełny scenariusz</caption>
          <thead>
            <tr>
              <th>Poparcie</th>
              <th>Lista</th>
              <th>L / R / C</th>
              <th>Sojusz</th>
              <th>Wybrany sojusz</th>
              <th>Uprawnione</th>
              <th>Działanie</th>
            </tr>
          </thead>
          <tbody>
            {output.points.slice(page * 50, page * 50 + 50).map((point) => (
              <tr key={point.x}>
                <td>
                  {pct(point.x)}%{point.exactThreshold ? ' · próg' : ''}
                </td>
                <td>{boundsText(point.selectedList)}</td>
                <td>
                  {point.campSeats.L} / {point.campSeats.R} / {point.campSeats.C}
                </td>
                <td>{boundsText(point.alliance)}</td>
                <td>{boundsText(point.selectedAlliance)}</td>
                <td>{point.eligibleCount}</td>
                <td>
                  <button onClick={() => onOpen(point)}>Otwórz próbkę</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Poprzednie próbki
        </button>
        <span>
          {page + 1} / {Math.ceil(output.points.length / 50)}
        </span>
        <button
          disabled={(page + 1) * 50 >= output.points.length}
          onClick={() => setPage(page + 1)}
        >
          Następne próbki
        </button>
      </div>
    </>
  );
}

function HeatResults({
  output,
  selected,
  onSelect,
  onOpen,
  onRefine,
}: {
  output: HeatOutput;
  selected: { x: number; y: number } | null;
  onSelect: (point: { x: number; y: number }) => void;
  onOpen: (x: number, y: number) => void;
  onRefine: () => void;
}) {
  const [page, setPage] = useState(0);
  const width = 640 / output.xValues.length,
    height = 360 / output.yValues.length;
  const cell = output.cells.find((item) => item.x === selected?.x && item.y === selected?.y);
  return (
    <>
      <p>
        <strong>
          {output.xValues.length} × {output.yValues.length} komórek
        </strong>{' '}
        · X: {output.xAxis.targetId} ← {output.xAxis.donorId}, krok {pct(output.xAxis.step)} p.p.;
        Y: {output.yAxis.targetId} ← {output.yAxis.donorId}, krok {pct(output.yAxis.step)} p.p.
      </p>
      <figure className="heat-chart">
        <svg
          viewBox="0 0 740 435"
          role="img"
          aria-label="Mapa większości. Wszystkie komórki są dostępne w tabeli poniżej."
        >
          {output.cells.map((item, index) => (
            <rect
              key={index}
              x={65 + (index % output.xValues.length) * width}
              y={
                20 +
                (output.yValues.length - 1 - Math.floor(index / output.xValues.length)) * height
              }
              width={width}
              height={height}
              fill={
                !item.bounds
                  ? '#e3e5e2'
                  : item.bounds.lower >= 231
                    ? '#137b78'
                    : item.bounds.upper >= 231
                      ? '#b79c36'
                      : '#ce9371'
              }
              stroke="#fff"
              strokeWidth="0.4"
              onClick={() => onSelect(item)}
            >
              <title>
                X {pct(item.x)}%; Y {pct(item.y)}%:{' '}
                {item.bounds ? `${boundsText(item.bounds)} mandatów` : item.error}
              </title>
            </rect>
          ))}
          <text x="65" y="405">
            X {pct(output.xValues[0])}%
          </text>
          <text x="705" y="405" textAnchor="end">
            {pct(output.xValues.at(-1)!)}%
          </text>
          <text x="0" y="32">
            {pct(output.yValues.at(-1)!)}%
          </text>
          <text x="0" y="380">
            {pct(output.yValues[0])}%
          </text>
        </svg>
        <figcaption>
          Turkus: ≥231 · terakota: &lt;231 · ochra: nierozstrzygnięte · szary: nieważna kombinacja.
        </figcaption>
      </figure>
      {cell && (
        <div className="notice">
          X {pct(cell.x)}%, Y {pct(cell.y)}%:{' '}
          {cell.bounds ? `${boundsText(cell.bounds)} mandatów` : cell.error}
          <div className="toolbar">
            <button disabled={!cell.bounds} onClick={() => onOpen(cell.x, cell.y)}>
              Otwórz komórkę
            </button>
            <button onClick={onRefine}>Uściślij obszar wokół komórki</button>
          </div>
        </div>
      )}
      <details>
        <summary>Tabela wszystkich komórek</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>X (%)</th>
                <th>Y (%)</th>
                <th>Mandaty / stan</th>
                <th>Działanie</th>
              </tr>
            </thead>
            <tbody>
              {output.cells.slice(page * 50, page * 50 + 50).map((item, index) => (
                <tr key={index}>
                  <td>{pct(item.x)}</td>
                  <td>{pct(item.y)}</td>
                  <td>{item.bounds ? boundsText(item.bounds) : `Nieważna: ${item.error}`}</td>
                  <td>
                    <button onClick={() => onSelect(item)}>Wybierz komórkę</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Poprzednie komórki
          </button>
          <span>
            {page + 1} / {Math.ceil(output.cells.length / 50)}
          </span>
          <button
            disabled={(page + 1) * 50 >= output.cells.length}
            onClick={() => setPage(page + 1)}
          >
            Następne komórki
          </button>
        </div>
      </details>
    </>
  );
}
