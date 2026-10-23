import { IPF_TOLERANCE } from '../model/constants';
import { REGIONAL_FAMILIES, type RegionalDistrict, type RegionalSummary } from '../model/regional';
import type { Family, Scenario } from '../model/types';
import { percent } from './display';

/** Paired bars share a fixed 0–100% scale; numeric labels convey the same information. */
export function RegionalShareCell({
  family,
  historical,
  projected,
}: {
  family: Family;
  historical: number;
  projected: number;
}) {
  return (
    <div className={`regional-share ${family}`} data-testid={`regional-share-${family}`}>
      <span className="regional-share-values">
        <span>{percent(historical * 100)}</span>
        <span aria-hidden="true"> → </span>
        <strong data-testid={`regional-share-${family}-projected`}>
          {percent(projected * 100)}
        </strong>
      </span>
      <span className="regional-bar historical" aria-hidden="true">
        <i style={{ width: `${historical * 100}%` }} />
      </span>
      <span className="regional-bar projected" aria-hidden="true">
        <i style={{ width: `${projected * 100}%` }} />
      </span>
    </div>
  );
}

export function RegionalDistrictProfile({
  district,
  scenario,
}: {
  district: RegionalDistrict;
  scenario: Scenario;
}) {
  return (
    <div className="regional-district-profile" aria-label="Elektoraty w wybranym okręgu">
      {REGIONAL_FAMILIES.map((family) => (
        <div key={family}>
          <strong>
            {family} · {scenario.familyLabels[family]}
          </strong>
          <small>2023 → scenariusz</small>
          <RegionalShareCell
            family={family}
            historical={district.historicalShares[family]}
            projected={district.projectedShares[family]}
          />
        </div>
      ))}
    </div>
  );
}

export default function RegionalProfiles({
  scenario,
  summary,
}: {
  scenario: Scenario;
  summary: RegionalSummary;
}) {
  const fits = summary.maxError <= IPF_TOLERANCE;
  return (
    <section className="regional-profiles" aria-labelledby="regional-heading">
      <div className="regional-heading">
        <div>
          <h3 id="regional-heading">Różne regiony, te same udziały krajowe</h3>
          <p className="small muted">
            {scenario.geographyMode === 'family'
              ? 'Geografia grup 2023: najpierw L / R / C, następnie podmioty wewnątrz każdej grupy.'
              : scenario.geographyMode === 'historical'
                ? 'Poprzedni model: profile komitetów z 2023 r. kalibrowane bezpośrednio do podmiotów.'
                : 'Porównanie: każda partia ma taki sam udział we wszystkich okręgach.'}
          </p>
        </div>
        <span className={`regional-fit ${fits ? '' : 'warning'}`} data-testid="geography-fit">
          {fits ? '✓ Średnie krajowe zachowane' : 'Sprawdź błąd kalibracji'}
        </span>
      </div>
      <div className="regional-national" aria-label="Krajowe udziały elektoratów">
        {REGIONAL_FAMILIES.map((family) => {
          const values = summary.families[family];
          return (
            <div className={family} key={family} data-testid={`regional-national-${family}`}>
              <span>
                {family} · {scenario.familyLabels[family]}
              </span>
              <strong>{percent(values.projectedShare * 100)}</strong>
              <small>Średnia ważona okręgów · cel: {percent(values.targetShare * 100)}</small>
              <small>
                W okręgach: {percent(values.minShare * 100)}–{percent(values.maxShare * 100)}
              </small>
            </div>
          );
        })}
      </div>
      <p className="small muted regional-reading-guide">
        W tabeli: wynik 2023 → udział scenariusza; górny pasek pokazuje 2023, dolny — scenariusz.
        Każdy pasek ma skalę 0–100% ważnych głosów w okręgu. L = KO + NL, R = PiS + Konfederacja, C
        = Trzecia Droga. Pozostałe komitety z 2023 r. pozostają poza tymi grupami. To elektoraty
        podmiotów, niezależne od późniejszego łączenia list i sojuszy.
      </p>
      <details>
        <summary>Sprawdź zgodność krajową każdego podmiotu</summary>
        <p className="small muted">
          Średnia jest ważona liczbą ważnych głosów z 2023 r., nie liczbą okręgów. Po edycji celem
          jest Twój scenariusz; opublikowany sondaż pozostaje osobną kolumną. Reszta 0,51% pozostaje
          w mianowniku. Maksymalny błąd udziału krajowego: {summary.maxError.toExponential(2)}.
        </p>
        <div className="table-scroll">
          <table aria-label="Zgodność poparcia krajowego">
            <thead>
              <tr>
                <th>Podmiot</th>
                <th>Sondaż</th>
                <th>Cel scenariusza</th>
                <th>Średnia z okręgów</th>
              </tr>
            </thead>
            <tbody>
              {summary.national.map((entity) => (
                <tr key={entity.id}>
                  <th scope="row">{entity.label}</th>
                  <td>
                    {entity.publishedShare === null
                      ? 'brak pomiaru'
                      : percent(entity.publishedShare * 100, 6)}
                  </td>
                  <td>{percent(entity.targetShare * 100, 6)}</td>
                  <td>{percent(entity.projectedShare * 100, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
