import manifest from '../data/source-manifest.json';
import { baselineTurnout, historicalData } from '../model/data';
import { LIMITATIONS } from '../model/persistence';
import { pollSnapshot } from '../model/presets';
import type { Scenario } from '../model/types';
import { number, percent } from './display';

export default function Methodology({ scenario }: { scenario: Scenario }) {
  return (
    <>
      <h3>Laboratorium, nie prognoza</h3>
      <p>
        Badamy, jak przy tych samych głosach progi i układ wspólnych list zmieniają podział
        mandatów. Grupy L/R/C są konwencją scenariusza. Przynależność KO do grupy L nie oznacza, że
        wszystkie jej podmioty są ideologicznie lewicowe.
      </p>
      <h3>Źródło poparcia</h3>
      <dl>
        <dt>Pracownia</dt>
        <dd>{pollSnapshot.pollster}</dd>
        <dt>Termin badania</dt>
        <dd>19–21 października 2026</dd>
        <dt>Publikacja</dt>
        <dd>22 października 2026</dd>
        <dt>Próba</dt>
        <dd>{number(pollSnapshot.sampleSize)}</dd>
        <dt>Tryb badania</dt>
        <dd>{pollSnapshot.mode ?? 'nie podano'}</dd>
        <dt>Niezdecydowani</dt>
        <dd>{pollSnapshot.undecidedTreatment ?? 'nie podano'}</dd>
        <dt>Weryfikacja źródła</dt>
        <dd>{pollSnapshot.lastVerified}</dd>
        <dt>Publikacje</dt>
        <dd>
          <a href={pollSnapshot.sourceUrls[0]} target="_blank" rel="noreferrer">
            Raport Zero.pl
          </a>{' '}
          ·{' '}
          <a href={pollSnapshot.sourceUrls[1]} target="_blank" rel="noreferrer">
            Raport Onet
          </a>
        </dd>
      </dl>
      <p>{pollSnapshot.denominatorConvention}</p>
      <p>
        PPS nie ma osobnego pomiaru: 0% to brak przydziału w scenariuszu, nie wynik sondażu. Wariant
        syntetyczny przenosi 1 punkt procentowy z Nowej Lewicy do PPS. Reszta 0,51% to Unia Centrum
        0,15% i inne odpowiedzi 0,36%; pozostaje w mianowniku, lecz nie tworzy jednej kwalifikującej
        się listy.
      </p>
      <h3>Głosy, progi i mandaty</h3>
      <p>
        Próg krajowy wynosi co najmniej 5% dla komitetu zwykłego lub 8% dla komitetu koalicyjnego.
        Nazwa polityczna nie wyznacza formy prawnej. Jeżeli zwykłe progi spełnia najwyżej jeden
        komitet, stosujemy art. 198: 3% / 5%. Zwolnienie mniejszości narodowej jest obsługiwane w
        odtworzeniu historycznym; nie ma go żaden z dziesięciu podmiotów scenariusza.
      </p>
      <p>
        Po kwalifikacji mandaty rozdzielamy metodą d’Hondta osobno w każdym okręgu. Remis dokładny
        rozstrzyga większa liczba głosów listy w okręgu; brak potrzebnych danych obwodowych zostawia
        przedział. Dla projekcji tolerancja 10⁻¹² przy granicy mandatu oznacza konserwatywne granice
        numeryczne, nie dowód remisu prawnego.
      </p>
      <p>
        231 to większość pełnego składu Sejmu, nie uniwersalna liczba głosów potrzebna do przyjęcia
        każdej uchwały. Mandatów wspólnej listy nie dzielimy między partie.
      </p>
      <p>
        <a
          href="https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20110210112/U/D20110112Lj.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Kodeks wyborczy
        </a>{' '}
        — tekst wskazany w specyfikacji z 8 października 2026, art. 193, 196–198 i 232–233.
      </p>
      <h3>Geografia i kalibracja</h3>
      <p>
        Profile geograficzne pochodzą z wyników komitetów w 2023 r. Do profilu dodajemy 1% składnika
        jednorodnego, po czym iteracyjnie dopasowujemy sumy okręgów i dokładne udziały krajowe (IPF,
        maksymalny błąd 10⁻¹², limit 10 000 iteracji). To regularizacja modelu, nie zmierzona
        migracja wyborców. Wspólna lista sumuje już skalibrowane głosy; samo łączenie nie powoduje
        nowej kalibracji.
      </p>
      <p>
        Przy frekwencji {percent(scenario.turnout * 100)} wszystkie okręgi skalowane są
        proporcjonalnie od dokładnej bazy {historicalData.totals.ballots2023} /{' '}
        {historicalData.totals.eligible2023} = {percent(baselineTurnout * 100, 6)}. Ten sam mnożnik
        nie zmienia mandatów.
      </p>
      <h3>Dane historyczne i pochodzenie</h3>
      <p>
        Zamrożono 41 okręgów i 460 mandatów z 2023 r. Głosy z zagranicy i statków są już przypisane
        do okręgu 19. Uprawnionych odczytujemy z finalnych wyników, a frekwencję z ważnych kart, nie
        tylko ważnych głosów na listy.
      </p>
      <dl>
        <dt>Wersja modelu</dt>
        <dd>{scenario.modelVersion}</dd>
        <dt>Wersja danych</dt>
        <dd>{scenario.dataVersion}</dd>
        <dt>Wersja parsera</dt>
        <dd>{manifest.parserVersion}</dd>
        <dt>Pobrano dane</dt>
        <dd>{manifest.retrievalDate}</dd>
      </dl>
      {manifest.sources.map((source) => (
        <p key={source.sourceUrl} className="small">
          <a href={source.sourceUrl} target="_blank" rel="noreferrer">
            {source.localPath.split('/').pop()}
          </a>
          <br />
          <span style={{ overflowWrap: 'anywhere' }}>SHA-256: {source.sha256}</span>
        </p>
      ))}
      <h3>Granice interpretacji</h3>
      <ul>
        {LIMITATIONS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Twoje zapisane założenia</h3>
      {scenario.notes.length ? (
        <ul>
          {scenario.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : (
        <p>
          Nie zmieniono udziałów sondażowych. Wybór form prawnych i podział L/R/C nadal stanowią
          założenia scenariusza.
        </p>
      )}
    </>
  );
}
