# Project context

Laboratorium koalicji is the static Polish Sejm coalition and threshold simulator specified in `prd.md`. Read `AGENTS.md` for shared development rules and `IMPLEMENTATION_PLAN.md` for milestones. The interface is Polish; code and technical documentation are English.

## Stack and architecture

- React + TypeScript + Vite, Node 24 LTS, npm lockfile; Prettier for TS/TSX/CSS formatting.
- Pure electoral mathematics in `src/model/`; React components must call that engine.
- Workers run exhaustive partitions and sensitivity; request IDs prevent stale results.
- Tiny Python 3.12 standard-library importer plus pytest/ruff development tools.
- Public official aggregate inputs in `data/raw/`; bundled JSON and manifest in `src/data/`.
- Published studies are frozen artifacts from `src/model/studies.ts`, generated with `npm run analyses -- --write`; `npm run analyses:check` verifies inputs and numerical results. UI workspace edits must not alter the report. Whole L+C/R blocks are primary; subgroup seats are secondary. Synthetic A/B parties have no measured poll split.
- Static GitHub Pages deployment to `/voting_schemes/`; hash state, no server routes.
- No AI integration, secret, API key, database, live polling or authentication.

## Commands

`npm ci`; `npm run dev`; `npm run typecheck`; `npm run format:check`; `npm test`; `npm run build`; `npm run test:e2e`.

Data checks: `uv sync --locked`; `uv run pytest -q tests/python`; `uv run ruff check scripts tests/python`; `uv run ruff format --check scripts tests/python`.

Run targeted tests first, then all unit/importer checks for core or IO changes. The delivery workflow runs these and browser acceptance checks before deployment.

## Critical invariants

Preserve 41 districts and 460 mandates; overseas votes are already in district 19. Use final eligible voters and valid ballot papers from results. Eligibility uses all valid list votes. Support units sum to 100,000,000 including the fixed residual. Threshold equality qualifies. Minority exemptions do not independently prevent the Article 198 fallback. Default model 1.1.0 first calibrates the fixed 2023 L=KO+NL, R=PiS+Konfederacja, C=TD camp profiles, then conditional entity profiles within each camp. Preserve district camp totals under within-family support changes. Retain the original `historical` and `uniform` modes and model 1.0.0 saved scenarios without changing their results. Pool calibrated atomic columns without refitting after group changes. A common list cannot contain both L and R. Seats belong to lists, not their component entities. Uniform turnout must not affect seats. Unresolved ties must remain visible as bounds.

Use `prd.md` as authoritative acceptance criteria. Distinguish published poll shares, user assumptions and model outputs. Do not change baseline data or fixtures just to pass tests.
