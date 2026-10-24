import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudySeatChart } from '../src/components/StudiesCharts';
import { matrixSvg } from '../src/components/Studies';
import { buildStudyReport } from '../src/model/studies';
import { studyCsv, studyMarkdown, type StudyPublication } from '../src/model/study-publication';

const root = process.cwd();
const check = process.argv.includes('--check');
const overwrite = process.argv.includes('--write');
const jsonPath = resolve(root, 'src/data/studies-report.json');
const output = resolve(root, 'analyses/pollster-2026-10');
const sourcePaths = [
  ...(await readdir(resolve(root, 'src/model')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `src/model/${file}`),
  'scripts/build_studies.mjs',
  'scripts/render_studies.tsx',
  'src/components/StudiesCharts.tsx',
  'src/components/Studies.tsx',
].sort();
const sourceDigest = createHash('sha256');
for (const path of sourcePaths)
  sourceDigest
    .update(path)
    .update('\0')
    .update(await readFile(resolve(root, path)))
    .update('\0');
const dataSha = createHash('sha256')
  .update(await readFile(resolve(root, 'src/data/historical.json')))
  .digest('hex');
let sourceGitSha: string | null = null;
let sourceWorkingTreeDirty: boolean | null = null;
try {
  const gitCwd = process.env.ANALYSIS_GIT_DIRECTORY ?? root;
  sourceGitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: gitCwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  sourceWorkingTreeDirty = Boolean(
    execFileSync('git', ['status', '--porcelain', '--', ...sourcePaths], {
      cwd: gitCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(),
  );
} catch {
  /* Normal source archives may have no Git metadata; hashes still identify inputs. */
}
const report = buildStudyReport();
const publication: StudyPublication = {
  report,
  provenance: {
    generatedAt: new Date().toISOString(),
    sourceGitSha,
    sourceWorkingTreeDirty,
    analysisSourceSha256: sourceDigest.digest('hex'),
    historicalDataSha256: dataSha,
    seed: null,
    command: 'npm run analyses -- --write',
  },
};
let previous: StudyPublication | undefined;
try {
  previous = JSON.parse(await readFile(jsonPath, 'utf8')) as StudyPublication;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
if (check) {
  if (
    !previous ||
    JSON.stringify(previous.report) !== JSON.stringify(report) ||
    previous.provenance.historicalDataSha256 !== dataSha ||
    previous.provenance.analysisSourceSha256 !== publication.provenance.analysisSourceSha256
  )
    throw new Error(
      'Published report is missing or stale. Review changes, then run npm run analyses -- --write.',
    );
  console.log('Published calculations and input/source hashes verified.');
} else {
  if (previous && !overwrite)
    throw new Error(
      'Report already exists. Use --check to verify or --write to regenerate derived analysis artifacts.',
    );
  await mkdir(output, { recursive: true });
  await writeFile(jsonPath, JSON.stringify(publication) + '\n');
  await writeFile(resolve(output, 'wnioski.md'), studyMarkdown(publication));
  await writeFile(resolve(output, 'wyniki.csv'), studyCsv(publication));
  const source = `Pollster 19–21.10.2026 · model ${report.metadata.modelVersion} · stałe poparcie bloków`;
  for (const policy of ['coalition', 'ordinary'] as const)
    await writeFile(
      resolve(output, `macierz-${policy}.svg`),
      matrixSvg(report.matrices[policy], source) + '\n',
    );
  for (const study of [...report.pairs, report.concentration]) {
    const pair = 'targetId' in study ? study : null;
    const targetLabel = pair?.targetLabel ?? 'Partia A';
    const donorLabel = pair?.donorLabel ?? 'Partia B';
    for (const pairOnly of pair ? [false, true] : [false]) {
      const name = `${study.id}${pairOnly ? '-para' : '-bloki'}.svg`;
      const markup = renderToStaticMarkup(
        <StudySeatChart
          points={study.points.map((point) => ({ ...point, ...point.outcome }))}
          title={
            pairOnly
              ? `Mandaty pary: ${targetLabel} / ${donorLabel}`
              : `L+C kontra R: ${targetLabel} / ${donorLabel}`
          }
          targetLabel={targetLabel}
          donorLabel={donorLabel}
          source={source}
          filename={name}
          currentUnits={pair?.baselineUnits}
          pairOnly={pairOnly}
        />,
      );
      const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6);
      if (!svg.startsWith('<svg')) throw new Error('SVG chart rendering failed.');
      await writeFile(resolve(output, name), svg + '\n');
    }
  }
  console.log(
    `Generated ${report.matrices.coalition.cells.length} matrix cells per policy; ${report.pairs.map((pair) => pair.points.length).join('/')} pair samples and ${report.concentration.points.length} two-party samples.`,
  );
  console.log(`Report: ${output}; JSON: ${jsonPath}`);
}
