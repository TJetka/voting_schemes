# Laboratorium koalicji

A Polish-language, nonpartisan scenario laboratory for the 460-seat Sejm: electoral thresholds, district d’Hondt allocation, common lists and parliamentary alliances. The specification is [prd.md](prd.md); implementation milestones and acceptance gates are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

This is a deterministic scenario model, **not an election forecast or a probability model**. It freezes the 41 official 2023 districts and mandates and uses a dated Pollster input from 19–21 October 2026. Geography, perfect vote retention and camp membership are explicit assumptions.

## Development

Use **Node.js 24 LTS** and npm. No API keys, backend, account, environment secrets or paid services are needed.

```sh
nvm use                  # if using nvm
npm ci
npm run dev
npm test                 # pure engine, state and exploration checks
npm run typecheck
npm run format:check
npm run build
npm run preview
```

Python 3.12 and uv are used only for reproducible official-data import and its tests; no Python code is shipped to the browser.

```sh
uv sync --locked
uv run python scripts/import_pkw.py --help
uv run pytest -q tests/python
uv run ruff check scripts tests/python
uv run ruff format --check scripts tests/python
```

Browser acceptance checks use Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

## Repository

```text
src/model/       Pure typed election engine, support conservation and state
src/components/  Polish interactive workspace and exploration
src/workers/     Cancellable exhaustive and sensitivity calculations
src/data/        Versioned normalized official data and source manifest
scripts/         Deterministic PKW importer
data/raw/       Small, immutable official inputs and provenance
tests/          Mathematical, historical, state and browser checks
.github/workflows/  Validation and GitHub Pages delivery
```

Raw election sources are public aggregate results and are intentionally versioned. All data needed to run the application are bundled. The app makes no external data requests and includes no analytics.

## Model and reproducibility

Support is stored in exact integer units (one million units per percentage point); a locked 0.51% residual remains in the denominator. Support edits use exact proportional donor arithmetic and deterministic largest remainders. The default model (1.1.0) first fits the 2023 regional electorates **L = KO + NL, R = PiS + Konfederacja, C = Trzecia Droga** to current camp totals. It then fits party profiles conditional on each camp's regional electorate. Both stages preserve district totals and each party's exact national support; the national average is weighted by valid votes, not by the number of districts. Redistributing support within a camp leaves its regional total and the other camps' votes unchanged. Atomic geography is fitted once before lists are pooled. Proportional turnout changes headcounts only.

The geography selector offers the new camp model, the original individual-profile fit, and uniform district support. District profiles compare 2023 shares with the current scenario and show national calibration checks. Shared 2023 proxies do not invent separate regional evidence for parties that ran together (notably PSL and Polska 2050). Existing 1.0.0 links and saved scenarios retain their previous calculation until the user explicitly adopts the new mode. The dated poll and immutable historical source files are unchanged.

With the default poll and separate lists, the new model gives L 226 / R 234 / C 0; the original fit remains L 228 / R 232 / C 0. These are model outputs, not measured results. The exact method and invariants are in PRD section 6.6.

Eligibility includes 5%/8% thresholds, the statutory fallback and explicit minority exemption in historical replay. List-level d’Hondt ties and numerical boundary ambiguities are visible rather than resolved by entity order. Historical results are validated against independently published official district seats. Scenario exports preserve model/data versions; JSON, URL and local state are validated before use.

## Deployment

Target: [TJetka/voting_schemes](https://github.com/TJetka/voting_schemes), project path `/voting_schemes/`. In GitHub **Settings → Pages → Build and deployment**, select **GitHub Actions**. The Pages workflow validates pull requests and deploys successful pushes to `main`. Deployment has scoped Pages and OIDC permissions; validation has read-only repository access.

```sh
BASE_PATH=/voting_schemes/ npm run build
npm run preview -- --base=/voting_schemes/
```

Live application: **https://tjetka.github.io/voting_schemes/** (deployment and public application verified on 23 October 2026). Hash-based scenario links preserve the repository path and work on refresh. For a root site or custom domain set the repository variable `BASE_PATH` to `/`.

Deployment follows [Vite’s static deployment guidance](https://vite.dev/guide/static-deploy.html) and [GitHub’s Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Working on this project

Read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). Run the smallest relevant tests after changes, then the full suite for engine or IO changes. Keep dataset provenance and model versions explicit. Never tune geographic weights to obtain a preferred political result. New heavy dependencies, changes to historical data, force pushes and destructive Git operations need explicit review.
