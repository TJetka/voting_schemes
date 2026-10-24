import { useState } from 'react';
import published from '../data/studies-report.json';
import { studyCsv, studyMarkdown, type StudyPublication } from '../model/study-publication';
import Studies from './Studies';
import { downloadText } from './display';

// Generated repository artifact; its numeric content is checked against the pure engine in tests.
const publication = published as StudyPublication;

export default function PublishedStudies() {
  const [link, setLink] = useState('');
  const reportLink = async () => {
    const url = new URL(window.location.href);
    url.search = '?view=analyses';
    url.hash = '';
    setLink(url.href);
    try {
      await navigator.clipboard.writeText(url.href);
    } catch {
      /* The visible input remains usable. */
    }
  };
  return (
    <>
      <Studies
        report={publication.report}
        exportActions={
          <>
            <button
              onClick={() =>
                downloadText(
                  'wnioski-lc-r.md',
                  studyMarkdown(publication),
                  'text/markdown;charset=utf-8',
                )
              }
            >
              Pobierz wnioski (Markdown)
            </button>
            <button
              onClick={() =>
                downloadText('wyniki-lc-r.csv', studyCsv(publication), 'text/csv;charset=utf-8')
              }
            >
              Pobierz wszystkie wyniki (CSV)
            </button>
            <button
              onClick={() =>
                downloadText(
                  'raport-lc-r.json',
                  JSON.stringify(publication, null, 2),
                  'application/json;charset=utf-8',
                )
              }
            >
              Pobierz raport (JSON)
            </button>
            <button onClick={() => void reportLink()}>Kopiuj link do raportu</button>
            {link && (
              <label className="study-report-link">
                Link do raportu
                <input
                  aria-label="Link do raportu"
                  value={link}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
              </label>
            )}
          </>
        }
      />
      <details className="study-provenance">
        <summary>Pochodzenie i odtwarzalność raportu</summary>
        <p>
          Wygenerowano {publication.provenance.generatedAt}. Obliczenia deterministyczne; bez
          losowania. Pełne wejścia zawiera eksport JSON.
        </p>
        <p>
          Kod: {publication.provenance.sourceGitSha ?? 'SHA niedostępne'}
          {publication.provenance.sourceWorkingTreeDirty
            ? ' + zmiany robocze opisane sumą kontrolną'
            : ''}
          .
        </p>
        <p>
          SHA-256 kodu analizy: <code>{publication.provenance.analysisSourceSha256}</code>
          <br />
          SHA-256 danych PKW: <code>{publication.provenance.historicalDataSha256}</code>
        </p>
      </details>
    </>
  );
}
