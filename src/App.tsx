import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import CoalitionBuilder from './components/CoalitionBuilder';
import Comparisons, { type PinnedScenario } from './components/Comparisons';
import Districts from './components/Districts';
import Exploration from './components/Exploration';
import Methodology from './components/Methodology';
import ResultSummary, { ResultBar } from './components/ResultSummary';
import SupportEditor from './components/SupportEditor';
import { boundsText, downloadText, errorText, number } from './components/display';
import { historicalData } from './model/data';
import { evaluateScenario, replayHistorical } from './model/engine';
import {
  exportResultsCsv,
  loadScenario,
  parseScenario,
  saveScenario,
  scenarioFromHash,
  scenarioId,
  scenarioToHash,
  serializeScenario,
} from './model/persistence';
import { createDefaultScenario, createSyntheticScenario } from './model/presets';
import type { Scenario } from './model/types';
import { validateScenario } from './model/validation';

const PublishedStudies = lazy(() => import('./components/PublishedStudies'));

type Tab = 'coalitions' | 'exhaustive' | 'sensitivity' | 'studies';
type Dialog = 'methodology' | 'import' | 'history' | 'share' | null;

function initialState(): { scenario: Scenario; error: string } {
  try {
    return { scenario: loadScenario() ?? createDefaultScenario(), error: '' };
  } catch (error) {
    return {
      scenario: createDefaultScenario(),
      error: `Nie odtworzono zapisanych danych: ${errorText(error)} Pokazano oryginalny scenariusz.`,
    };
  }
}

export default function App() {
  const [initial] = useState(initialState);
  const [scenario, setScenario] = useState(initial.scenario);
  const [past, setPast] = useState<Scenario[]>([]);
  const [future, setFuture] = useState<Scenario[]>([]);
  const [notice, setNotice] = useState(initial.error);
  const [isError, setIsError] = useState(Boolean(initial.error));
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get('view') === 'analyses'
      ? 'studies'
      : 'coalitions',
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [district, setDistrict] = useState<number | null>(null);
  const [pins, setPins] = useState<PinnedScenario[]>([
    { id: 1, scenario: structuredClone(initial.scenario) },
  ]);
  const [baselineId, setBaselineId] = useState(1);
  const nextPin = useRef(2);
  const modal = useRef<HTMLDialogElement>(null);
  const baseline = pins.find((pin) => pin.id === baselineId)?.scenario ?? pins[0].scenario;
  const calculation = useMemo(() => {
    try {
      return { result: evaluateScenario(scenario), error: '' };
    } catch (error) {
      return { result: null, error: errorText(error) };
    }
  }, [scenario]);
  const baselineResult = useMemo(() => evaluateScenario(baseline), [baseline]);
  const history = useMemo(() => replayHistorical(), []);
  const historicalPassed = history.districtAllocations.every((item) =>
    historicalData.committees.every(
      (committee) =>
        (item.seatsByList[committee.id] ?? 0) ===
        (historicalData.officialSeats.districts[String(item.districtId)]?.[committee.id] ?? 0),
    ),
  );
  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'studies') url.searchParams.set('view', 'analyses');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  };
  const error = (message: string) => {
    setNotice(message);
    setIsError(true);
  };
  const announce = (message: string) => {
    setNotice(message);
    setIsError(false);
  };
  const clearHash = () => {
    if (window.location.hash)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  };
  const change = (next: Scenario, message?: string) => {
    try {
      validateScenario(next);
      setPast((old) => [...old.slice(-49), scenario]);
      setFuture([]);
      setScenario(next);
      clearHash();
      if (message) announce(message);
    } catch (cause) {
      error(errorText(cause));
    }
  };
  useEffect(() => {
    if (scenario === initial.scenario && initial.error) return;
    try {
      saveScenario(scenario);
    } catch (cause) {
      error(`Nie udało się zapisać lokalnie: ${errorText(cause)} Możesz wyeksportować JSON.`);
    }
  }, [scenario, initial]);
  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal();
    else if (!dialog && modal.current?.open) modal.current?.close();
  }, [dialog]);
  useEffect(() => {
    const readHash = () => {
      if (!window.location.hash.startsWith('#s=')) return;
      try {
        const next = scenarioFromHash(window.location.hash);
        setScenario(next);
        setPast([]);
        setFuture([]);
        announce('Odtworzono scenariusz z linku.');
      } catch (cause) {
        error(errorText(cause));
      }
    };
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((old) => [scenario, ...old]);
    setScenario(past[past.length - 1]);
    setPast(past.slice(0, -1));
    clearHash();
    announce('Cofnięto zmianę.');
  };
  const redo = () => {
    if (!future.length) return;
    setPast((old) => [...old, scenario]);
    setScenario(future[0]);
    setFuture(future.slice(1));
    clearHash();
    announce('Ponowiono zmianę.');
  };
  const openScenario = (next: Scenario) => {
    change(next, 'Otworzono konkretny układ list. Sprawdź wybór sojuszu parlamentarnego.');
    setTab('coalitions');
  };
  const inspectDistrict = (id: number) => {
    setDistrict(id);
    setTab('coalitions');
    setTimeout(
      () =>
        document
          .getElementById('district-inspector')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      50,
    );
  };
  const share = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}${window.location.search}${scenarioToHash(scenario)}`;
      setShareLink(url);
      window.history.replaceState(null, '', url);
      setDialog('share');
      try {
        await navigator.clipboard.writeText(url);
        announce('Skopiowano link odtwarzający scenariusz.');
      } catch {
        announce('Link jest gotowy. Skopiuj go z otwartego okna.');
      }
    } catch (cause) {
      error(errorText(cause));
    }
  };
  const applyImport = () => {
    try {
      const next = parseScenario(importText);
      change(next, 'Zaimportowano i zweryfikowano scenariusz.');
      setDialog(null);
      setImportError('');
      setTab('coalitions');
    } catch (cause) {
      setImportError(errorText(cause));
    }
  };
  const result = calculation.result;
  return (
    <div className={`app-shell ${tab === 'studies' ? 'studies-view' : ''}`}>
      <a
        className="visually-hidden"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('workspace')?.focus();
        }}
      >
        Przejdź do narzędzi
      </a>
      <header className="topbar">
        <div className="wordmark">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          LABORATORIUM
          <br />
          KOALICJI
        </div>
        <div className="top-actions">
          <button onClick={() => setDialog('history')}>Odtwórz 2023</button>
          <button onClick={() => setDialog('methodology')}>Metoda i źródła</button>
          {tab !== 'studies' && (
            <button className="primary" onClick={() => void share()}>
              Udostępnij ↗
            </button>
          )}
        </div>
      </header>
      <section className="hero">
        <div>
          <span className="eyebrow">POLSKI SEJM / INTERAKTYWNE LABORATORIUM</span>
          <h1>
            Te same głosy.
            <br />
            Inny układ sił.
          </h1>
          <p>
            Sprawdź, co zmienia wspólna lista, próg wyborczy i geografia poparcia. Zbuduj scenariusz
            i zobacz, skąd bierze się większość.
          </p>
        </div>
        <div className="source-stamp">
          <span className="badge live">Model scenariuszowy</span>
          <br />
          <strong>{tab === 'studies' ? 'Raport: zamrożony sondaż Pollster' : scenario.name}</strong>
          <br />
          <span>Pollster · 19–21.10.2026 · n = 1014</span>
          <br />
          <span>41 okręgów · podział mandatów 2023</span>
        </div>
      </section>
      {result && tab !== 'studies' && <ResultBar scenario={scenario} result={result} />}
      <nav className="tabs" role="tablist" aria-label="Obszary laboratorium">
        {(
          [
            { id: 'coalitions', title: 'Koalicje' },
            { id: 'exhaustive', title: 'Wszystkie konfiguracje' },
            { id: 'sensitivity', title: 'Wrażliwość' },
            { id: 'studies', title: 'Analizy i wnioski' },
          ] as const
        ).map((item, index) => (
          <button
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`tab-${item.id}`}
            id={`nav-${item.id}`}
            key={item.id}
            onClick={() => selectTab(item.id)}
          >
            <span className="tab-number">0{index + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      {notice && tab !== 'studies' && (
        <div className={`notice ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>
          <span>{notice}</span>
          <button aria-label="Zamknij komunikat" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {calculation.error && tab !== 'studies' && (
        <div className="notice error" role="alert">
          Błąd modelu: {calculation.error}
          <button onClick={() => change(createDefaultScenario())}>Przywróć sondaż</button>
        </div>
      )}
      {tab !== 'studies' &&
        result?.warnings.map((warning) => (
          <p className="callout warning" key={warning} role="status">
            {warning}
          </p>
        ))}
      <main id="workspace" tabIndex={-1}>
        {tab === 'studies' ? (
          <div role="tabpanel" id="tab-studies" aria-labelledby="nav-studies">
            <Suspense fallback={<p role="status">Wczytywanie raportu…</p>}>
              <PublishedStudies />
            </Suspense>
          </div>
        ) : (
          result && (
            <>
              <div
                className="toolbar"
                style={{ justifyContent: 'space-between', marginBottom: 18 }}
              >
                <div className="inline">
                  <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    Wczytaj wariant
                    <select
                      aria-label="Wariant początkowy"
                      value=""
                      onChange={(event) => {
                        if (event.target.value)
                          change(
                            event.target.value === 'synthetic'
                              ? createSyntheticScenario()
                              : createDefaultScenario(),
                            'Wczytano wariant. Przypięta baza pozostaje zamrożona.',
                          );
                      }}
                    >
                      <option value="">Wybierz…</option>
                      <option value="poll">Pollster · 19–21.10.2026</option>
                      <option value="synthetic">Dziesięć podmiotów — scenariusz syntetyczny</option>
                    </select>
                  </label>
                  <button aria-label="Cofnij zmianę" disabled={!past.length} onClick={undo}>
                    ↶ Cofnij
                  </button>
                  <button aria-label="Ponów zmianę" disabled={!future.length} onClick={redo}>
                    ↷ Ponów
                  </button>
                </div>
                <div className="inline">
                  <button
                    className="small"
                    onClick={() => {
                      setDialog('import');
                      setImportError('');
                    }}
                  >
                    Import JSON
                  </button>
                  <button
                    className="small"
                    onClick={() =>
                      downloadText(
                        'scenariusz-koalicji.json',
                        serializeScenario(scenario),
                        'application/json;charset=utf-8',
                      )
                    }
                  >
                    Eksport JSON
                  </button>
                  <button
                    className="small"
                    onClick={() =>
                      downloadText(
                        'mandaty-koalicji.csv',
                        exportResultsCsv(scenario, result),
                        'text/csv;charset=utf-8',
                      )
                    }
                  >
                    Eksport CSV
                  </button>
                  <button
                    className="small subtle"
                    onClick={() =>
                      change(createDefaultScenario(), 'Przywrócono oryginalny sondaż.')
                    }
                  >
                    Reset
                  </button>
                </div>
              </div>
              {tab === 'coalitions' ? (
                <div role="tabpanel" id="tab-coalitions" aria-labelledby="nav-coalitions">
                  <div className="workspace">
                    <SupportEditor scenario={scenario} onChange={change} onError={error} />
                    <div className="stack">
                      <CoalitionBuilder
                        scenario={scenario}
                        result={result}
                        baseline={baseline}
                        baselineResult={baselineResult}
                        onChange={change}
                        onError={error}
                      />
                      <ResultSummary
                        scenario={scenario}
                        result={result}
                        baselineResult={baselineResult}
                      />
                    </div>
                  </div>
                  <Comparisons
                    scenario={scenario}
                    result={result}
                    pins={pins}
                    baselineId={baselineId}
                    onPin={() =>
                      setPins([
                        ...pins,
                        { id: nextPin.current++, scenario: structuredClone(scenario) },
                      ])
                    }
                    onBaseline={setBaselineId}
                    onRemove={(id) => {
                      const remaining = pins.filter((pin) => pin.id !== id);
                      setPins(remaining);
                      if (baselineId === id) setBaselineId(remaining[0].id);
                    }}
                    onOpen={openScenario}
                    onRename={(id, name) =>
                      setPins(
                        pins.map((pin) =>
                          pin.id === id ? { ...pin, scenario: { ...pin.scenario, name } } : pin,
                        ),
                      )
                    }
                  />
                  <Districts
                    scenario={scenario}
                    result={result}
                    baseline={baseline}
                    baselineResult={baselineResult}
                    selectedDistrict={district}
                    onSelect={setDistrict}
                  />
                </div>
              ) : (
                <div role="tabpanel" id={`tab-${tab}`} aria-labelledby={`nav-${tab}`}>
                  <Exploration
                    scenario={scenario}
                    mode={tab}
                    onOpenScenario={openScenario}
                    onInspectDistrict={inspectDistrict}
                  />
                </div>
              )}
            </>
          )
        )}
      </main>
      <footer className="app-footer">
        <span>
          Model scenariuszowy · bez prognoz i prawdopodobieństw · jawne założenia i odtwarzalne
          obliczenia
        </span>
        <span>
          {tab === 'studies'
            ? 'Raport na podstawie sondażu Pollster · 19–21.10.2026'
            : `${scenario.modelVersion} / ${scenario.dataVersion} · scenariusz ${scenarioId(scenario)}`}
        </span>
      </footer>
      <dialog ref={modal} onClose={() => setDialog(null)} aria-labelledby="dialog-title">
        <header className="dialog-header">
          <h2 id="dialog-title">
            {dialog === 'methodology'
              ? 'Metoda, źródła i założenia'
              : dialog === 'history'
                ? 'Odtworzenie oficjalnych wyników 2023'
                : dialog === 'share'
                  ? 'Udostępnij ten scenariusz'
                  : 'Importuj scenariusz JSON'}
          </h2>
          <button onClick={() => setDialog(null)} aria-label="Zamknij okno">
            ×
          </button>
        </header>
        <div className="dialog-body">
          {dialog === 'methodology' && (
            <Methodology scenario={tab === 'studies' ? createDefaultScenario() : scenario} />
          )}
          {dialog === 'import' && (
            <>
              <p>
                Wczytaj eksportowany plik lub wklej JSON. Sprawdzimy wersje modelu i danych, sumę
                poparcia, podmioty i zgodność list.
              </p>
              <label className="field">
                Plik JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 100_000) {
                      setImportError('Plik przekracza limit 100 kB.');
                      return;
                    }
                    try {
                      setImportText(await file.text());
                      setImportError('');
                    } catch (cause) {
                      setImportError(errorText(cause));
                    }
                  }}
                />
              </label>
              <label className="field" style={{ margin: '16px 0' }}>
                Treść scenariusza
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                />
              </label>
              {importError && (
                <p role="alert" className="notice error">
                  {importError}
                </p>
              )}
              <button className="primary" onClick={applyImport}>
                Zweryfikuj i wczytaj
              </button>
            </>
          )}
          {dialog === 'share' && (
            <>
              <p>
                Link zawiera wejścia scenariusza oraz wersje danych i modelu. Osoba otwierająca link
                odtworzy te same obliczenia.
              </p>
              <label className="field">
                Link do scenariusza
                <textarea
                  readOnly
                  value={shareLink}
                  onFocus={(event) => event.target.select()}
                  style={{ height: 150 }}
                />
              </label>
              <p className="small muted">
                Adres zachowuje ścieżkę projektu. Udostępniane są również zmienione nazwy i ostatnie
                notatki scenariusza.
              </p>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(shareLink)
                    .then(() => announce('Skopiowano link.'))
                    .catch(() => announce('Zaznacz i skopiuj link ręcznie.'))
                }
              >
                Kopiuj link
              </button>
            </>
          )}
          {dialog === 'history' && (
            <>
              <p className={`callout ${historicalPassed ? '' : 'warning'}`}>
                <strong>
                  {historicalPassed
                    ? '✓ Zgodność wszystkich 41 okręgów i 460 mandatów'
                    : 'Wykryto różnicę względem kontroli — sprawdź dane'}
                </strong>
                <br />
                Odtworzenie używa rzeczywistych głosów i rejestracji komitetów z 2023 r., bez
                sondażu, projekcji i dziesięciu slotów. Kontrolne mandaty pochodzą z niezależnego
                obwieszczenia PKW.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Komitet</th>
                      <th>Forma / próg</th>
                      <th>Obliczono</th>
                      <th>Oficjalnie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.committees.map((committee) => (
                      <tr key={committee.id}>
                        <td>{committee.label}</td>
                        <td>
                          {committee.minorityExempt
                            ? 'Mniejszość — zwolnienie'
                            : committee.committeeType === 'coalition'
                              ? 'Koalicyjny 8%'
                              : 'Zwykły 5%'}
                        </td>
                        <td>{boundsText(history.nationalListSeatBounds[committee.id])}</td>
                        <td>{historicalData.officialSeats.national[committee.id] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small">
                Ważne głosy: {number(historicalData.totals.validVotes2023)} · ważne karty:{' '}
                {number(historicalData.totals.ballots2023)} · uprawnieni:{' '}
                {number(historicalData.totals.eligible2023)}. Zagranica jest już w okręgu 19.
              </p>
              <details open>
                <summary>Podział wszystkich 41 okręgów</summary>
                <div className="table-scroll" style={{ maxHeight: 420, marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Okręg</th>
                        <th>Wynik obliczony</th>
                        <th>Kontrola PKW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.districtAllocations.map((allocation) => (
                        <tr key={allocation.districtId}>
                          <td>
                            {allocation.districtId}.{' '}
                            {
                              historicalData.districts.find(
                                (item) => item.id === allocation.districtId,
                              )?.commissionSeat
                            }
                          </td>
                          <td>
                            {historicalData.committees
                              .filter((committee) => allocation.seatsByList[committee.id])
                              .map(
                                (committee) =>
                                  `${committee.id}: ${allocation.seatsByList[committee.id]}`,
                              )
                              .join(' · ')}
                          </td>
                          <td>
                            {historicalData.committees
                              .filter(
                                (committee) =>
                                  historicalData.officialSeats.districts[
                                    String(allocation.districtId)
                                  ][committee.id],
                              )
                              .map(
                                (committee) =>
                                  `${committee.id}: ${historicalData.officialSeats.districts[String(allocation.districtId)][committee.id]}`,
                              )
                              .join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="small muted">
                Zgodność historyczna weryfikuje import i podział mandatów. Nie weryfikuje trafności
                przyszłego rozkładu geograficznego.
              </p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
