import { listFamily } from '../model/coalitions';
import { evaluateScenario } from '../model/engine';
import type { Result, Scenario } from '../model/types';
import { boundsText, listShort, percent, signed } from './display';

export interface PinnedScenario {
  id: number;
  scenario: Scenario;
}
interface Props {
  scenario: Scenario;
  result: Result;
  pins: PinnedScenario[];
  baselineId: number;
  onPin: () => void;
  onBaseline: (id: number) => void;
  onRemove: (id: number) => void;
  onOpen: (scenario: Scenario) => void;
  onRename: (id: number, name: string) => void;
}

export default function Comparisons({
  scenario,
  result,
  pins,
  baselineId,
  onPin,
  onBaseline,
  onRemove,
  onOpen,
  onRename,
}: Props) {
  const baseline = pins.find((pin) => pin.id === baselineId) ?? pins[0];
  const baselineResult = evaluateScenario(baseline.scenario);
  const resolvedComparison = result.status === 'resolved' && baselineResult.status === 'resolved';
  const fixedElectorate =
    scenario.geographyMode === baseline.scenario.geographyMode &&
    scenario.entities.every((entity) =>
      baseline.scenario.entities.some(
        (old) =>
          old.id === entity.id &&
          old.supportUnits === entity.supportUnits &&
          old.proxyId === entity.proxyId,
      ),
    );
  const mergers = scenario.lists.filter(
    (list) =>
      list.memberEntityIds.length > 1 && !baseline.scenario.lists.some((old) => old.id === list.id),
  );
  return (
    <section className="panel comparison-section" aria-labelledby="comparison-heading">
      <div className="panel-heading">
        <div>
          <span className="section-no">04 / PUNKT ODNIESIENIA</span>
          <h2 id="comparison-heading">Porównaj i wyjaśnij zmianę</h2>
          <p>Przypięte scenariusze zachowują poparcie, układ list i wybór sojuszu.</p>
        </div>
        <button disabled={pins.length >= 4} onClick={onPin}>
          + Przypnij scenariusz ({pins.length}/4)
        </button>
      </div>
      <div className="pinned-grid">
        {pins.map((pin) => {
          const value = evaluateScenario(pin.scenario);
          return (
            <article
              key={pin.id}
              className={`pinned-card ${pin.id === baselineId ? 'baseline' : ''}`}
            >
              <label className="visually-hidden" htmlFor={`pin-${pin.id}`}>
                Nazwa przypiętego scenariusza
              </label>
              <input
                id={`pin-${pin.id}`}
                defaultValue={pin.scenario.name}
                key={pin.scenario.name}
                onBlur={(event) => {
                  if (event.target.value.trim()) onRename(pin.id, event.target.value.trim());
                }}
              />
              <p>
                L <strong>{boundsText(value.campBounds.L)}</strong> · R{' '}
                <strong>{boundsText(value.campBounds.R)}</strong> · C{' '}
                <strong>{boundsText(value.campBounds.C)}</strong>
                <br />
                Wybrany sojusz: {boundsText(value.allianceSeats)}
              </p>
              <div className="toolbar">
                <button onClick={() => onBaseline(pin.id)} disabled={pin.id === baselineId}>
                  {pin.id === baselineId ? '✓ Baza porównań' : 'Ustaw jako bazę'}
                </button>
                <button onClick={() => onOpen(structuredClone(pin.scenario))}>Otwórz</button>
                <button
                  className="subtle"
                  aria-label={`Usuń przypięty scenariusz ${pin.scenario.name}`}
                  disabled={pins.length === 1}
                  onClick={() => onRemove(pin.id)}
                >
                  ×
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Scenariusz</th>
              <th>L</th>
              <th>R</th>
              <th>C</th>
              <th>Sojusz</th>
              <th>Listy nad progiem</th>
              <th>Głosy na niezakwalifikowane</th>
            </tr>
          </thead>
          <tbody>
            {[
              { scenario, current: true },
              ...pins.map((pin) => ({ scenario: pin.scenario, current: false })),
            ].map((row, index) => {
              const value = row.current ? result : evaluateScenario(row.scenario);
              return (
                <tr key={index}>
                  <td>{row.current ? '● Obecny' : row.scenario.name}</td>
                  <td>{boundsText(value.campBounds.L)}</td>
                  <td>{boundsText(value.campBounds.R)}</td>
                  <td>{boundsText(value.campBounds.C)}</td>
                  <td>{boundsText(value.allianceSeats)}</td>
                  <td>{value.eligibleListCount}</td>
                  <td>{percent(value.excludedVoteShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!resolvedComparison && (
        <p className="callout warning" style={{ marginTop: 18 }}>
          Wynik bieżący lub baza ma nierozstrzygnięte mandaty. Tabela pokazuje przedziały;
          dokładnego zysku wspólnej listy i transferów między grupami nie da się jeszcze określić.
        </p>
      )}
      {mergers.length > 0 && resolvedComparison && (
        <div style={{ marginTop: 18 }}>
          <h3>Skąd biorą się mandaty wspólnej listy?</h3>
          {!fixedElectorate && (
            <p className="callout warning">
              Poparcie lub geografia różnią się od bazy. Poniższych różnic nie można przypisać
              samemu połączeniu list.
            </p>
          )}
          {mergers.map((list) => {
            const previous = baseline.scenario.lists.filter((old) =>
              old.memberEntityIds.every((id) => list.memberEntityIds.includes(id)),
            );
            const overlap = baseline.scenario.lists.some(
              (old) =>
                old.memberEntityIds.some((id) => list.memberEntityIds.includes(id)) &&
                !old.memberEntityIds.every((id) => list.memberEntityIds.includes(id)),
            );
            if (overlap)
              return (
                <p className="small" key={list.id}>
                  {listShort(list)}: baza zawiera listę obejmującą także inne podmioty; jej mandatów
                  nie dzielimy między partie.
                </p>
              );
            const family = listFamily(list, scenario.entities);
            const before = previous.reduce(
              (sum, old) => sum + (baselineResult.nationalListSeats[old.id] ?? 0),
              0,
            );
            const after = result.nationalListSeats[list.id] ?? 0;
            const campDelta = result.campSeats[family] - baselineResult.campSeats[family];
            return (
              <div key={list.id} className="callout" style={{ marginTop: 10 }}>
                <strong>
                  {listShort(list)}: {before} → {after} mandatów ({signed(after - before)})
                </strong>
                <p>
                  Inne listy grupy {family}: {signed(campDelta - (after - before))}. Cała grupa{' '}
                  {family}: {signed(campDelta)}.{' '}
                  {(['L', 'R', 'C'] as const)
                    .filter((item) => item !== family)
                    .map(
                      (item) =>
                        `${item}: ${signed(result.campSeats[item] - baselineResult.campSeats[item])}`,
                    )
                    .join(' · ')}
                  .
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
