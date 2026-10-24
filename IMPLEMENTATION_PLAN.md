# Implementation plan

The full acceptance contract is `prd.md`. Work proceeds through these gates; implementation and verification status is recorded below.

## 0. Repository and environment

Replace the unrelated Python/ML template with React/TypeScript/Vite on Node 24 LTS. Retain a minimal Python environment for a standard-library importer, pytest and ruff. Add lockfiles, project commands, shared agent context and this plan. Initialize version control and connect the supplied GitHub repository.

## 1. Verified data and electoral core

Download the two official PKW archives, verify all four PRD hashes, parse exact fields and preserve registration coverage. Extract independent district seat results from the official notice. Version normalized JSON, compressed small sources and a provenance manifest. Implement exact national thresholds, fallback/minority behavior, historical d’Hondt cross-products and explicit unresolved cutoff bounds.

**Gate:** all 41 historical district allocations and the national 194/157/65/26/18 distribution match the independent official notice; control totals and source hashes pass.

## 2. Scenario engine

Implement exact support units and BigInt donor rounding, dated/synthetic presets, positive-regularized IPF, canonical atomic calibration, turnout limits, permitted partitions, stable list identities and whole-list alliances. Strictly validate imported state.

**Gate:** PRD synthetic and polling regression fixtures, conservation/margin invariants, enumeration counts 2,385/8,378, turnout invariance and order/tie checks pass.

## 3. Polish interactive workspace

Build support editing, list merging/moving/splitting, committee choices, undo/redo, selected alliances, four frozen comparisons, merger decomposition, district table and quotient inspector. Add historical replay, geography/turnout controls, source/methodology disclosure and responsive keyboard operation.

**Gate:** the two PRD demonstrations (NL + Razem and centre 5%/8%) are reproducible and explained in the interface.

## 4. Exhaustive and sensitivity exploration

Use a cancellable Worker with progress, request IDs and cached canonical partitions. Render a scatter plot and filtered/sortable accessible table; opening a row reconstructs its scenario. Add frozen-start 1D sweeps, exact national-threshold adjacent samples, step plots and district transition logs. Add a 2D grid with disjoint donors, limits, invalid-cell handling and local refinement.

**Gate:** fixed support/geography is preserved across grouping comparisons, stale results are rejected, limits are enforced and samples reconstruct the same manual result.

## 5. Reproducibility and delivery

Implement versioned JSON/CSV export, validated JSON import, URL hashes, local persistence and reset. Add small Playwright journeys, subpath build checks, production build and the explicitly requested GitHub Pages validation/deployment workflow. Push milestone commits to `TJetka/voting_schemes`, enable/check Pages where authorized access permits and verify the public URL.

**Gate:** complete checks pass; a clean browser reproduces exported/shared scenarios; deployment status is reported only after verification.

## Validation record

All five implementation gates and the repository setup are complete. Validation and GitHub Pages deployment succeeded in [run 39926924151](https://github.com/TJetka/voting_schemes/actions/runs/39926924151). The public application is live at https://tjetka.github.io/voting_schemes/ and was checked in Chrome on 23 October 2026.

Verified on 23 October 2026:

- 59 Vitest tests pass, including every official historical district result, all six polling fixtures, mathematical edge cases, partition counts, Unicode/JSON/hash roundtrips, exact threshold probes, heatmap limits and stale response rejection.
- 10 pytest importer tests pass; Ruff lint and format checks pass.
- TypeScript strict checking, Prettier checking and the production build pass on Node 24.22.1.
- Direct native Chrome acceptance checks pass: keyboard merge, forbidden L–C–R combination, centre 8%/5%, donor conservation, turnout invariance, historical replay, JSON import, share and refresh, district quotient explanation and 390 CSS pixel layout without overflow.
- Browser Worker measurements on this macOS ARM64 desktop: default 2,385 partitions in 2.50 s; default 21×21 heatmap in 0.86 s. Both remain cancellable and preserve declared resolution. These are observations, not timing assertions in tests.
- Exhaustive result replay reproduced 266/194/0 in the manual builder. The 1D transition log correctly identifies 4.999999% → 5% eligibility for Razem and opens affected district allocations.
- Playwright contains 13 acceptance journeys, including ordinary-fragment navigation and malformed-share handling. Local headless Chromium launch is restricted by the host sandbox; native browser checks above remain separate evidence. GitHub Actions runs the automated suite under the repository subpath. Its validation job passed all 13 journeys, the full unit/importer suite, formatting, type checking and production build in [run 39925872372](https://github.com/TJetka/voting_schemes/actions/runs/39925872372).
- The first CI attempt passed all unit/importer checks but failed installing Chromium while `ubuntu-latest` migrated to Ubuntu 26. Delivery now pins Ubuntu 24.04; the dependency stack is updated and locked.

The source repository is https://github.com/TJetka/voting_schemes. The workspace protects `.git`, so this session used Git metadata at `/tmp/coalition-git/.git` with this workspace as its work tree. A normal clone of the pushed repository has standard Git metadata.

The initial deployment was blocked because Pages was disabled. The repository owner enabled GitHub Actions as the Pages source; GitHub now reports `has_pages: true`. A subsequent runner stalled during the browser download, so the delivery workflow uses Playwright’s smaller headless-only Chromium download and a five-minute installation timeout. The final workflow successfully published the validated build to https://tjetka.github.io/voting_schemes/. HTTP 200 and the live Polish interface were verified; the public Worker enumerates all 2,385 default groupings correctly. Final automated validation: 59 TypeScript unit tests, 10 Python importer tests, 13 Playwright journeys, strict type checking, formatting and production build all passed.


## Adjustment: regional electorates (model 1.1.0)

User-requested scope: apply 2023 regional heterogeneity within left/liberal, right and centre electorates while preserving national poll targets.

1. Add two-stage IPF: fixed historical camp geography, then conditional party geography inside the fitted camp electorate. Keep the previous individual fit and uniform comparison.
2. Preserve old scenario results; version the new default as 1.1.0 and make adoption explicit for existing 1.0.0 state.
3. Show weighted national calibration checks and district 2023/scenario profiles; explain the shared-proxy limits.
4. Verify national/district margins, within-camp transfer invariance, empty/tiny camps, pooling, turnout, legacy fixtures and official replay; update browser journeys for the intentional new default.
5. Commit, push through the existing validation/deployment workflow, and verify the public application.

The adjustment is complete and deployed. [Run 39959628761](https://github.com/TJetka/voting_schemes/actions/runs/39959628761) passed **83 TypeScript unit tests, 10 Python importer tests, 16 Playwright journeys**, strict type checking, formatting, the repository-subpath build and GitHub Pages publication. The public application at https://tjetka.github.io/voting_schemes/ was verified in Chrome on 23 October 2026: existing 1.0.0 state retained 228/232 seats, explicit adoption produced 226/234, and the district inspector displayed Warsaw camp shares 64.99% / 29.93% / 4.59% with national averages preserved.

Native Chrome also verified a 2 p.p. KO→NL transfer leaves Warsaw camp shares unchanged and the new model completes all 2,385 exhaustive configurations (4.16 s observed). Official source data and dependencies are unchanged. Two CI attempts timed out while installing Chromium; the owner explicitly approved increasing only that workflow step's timeout from five to ten minutes. The approved run then validated and deployed successfully. Existing saved scenarios keep their original mode until explicit adoption; new scenarios default to model 1.1.0's family geography.


## Published analyses: two blocks and vote splitting

Requested on 24 October 2026. Use the existing dated Pollster snapshot and family geography; the report always presents L+C versus R as its main outcome. The user confirmed that the two hypothetical C+L parties should share the same pooled regional profile.

1. Compute the Cartesian product of 15 right-wing set partitions and 52 L+C partitions (780 cells), under both common-list threshold policies; preserve all baseline atomic votes.
2. Sweep the three requested voter pairs from zero to their fixed combined share, nominally every 0.25 p.p.; add mirrored samples, current shares and exact threshold neighbours. Show pair mandates as a secondary outcome.
3. Compare default L+C fragmentation, one party, and two hypothetical 5% parties sharing the pooled L+C profile. Sweep every 0.5 p.p. with mirrored samples, midpoint and exact threshold probes; hold R fixed.
4. Add an independently accessible report tab, readable findings, matrix and sample charts, data tables, standalone SVGs and Markdown/CSV/JSON exports. Keep published calculations independent of workspace edits.
5. Record frozen inputs, model/data/analysis versions, source hashes and code provenance; verify independent numerical fixtures, matrix coverage, margins, endpoint equivalence and block outcomes under internal ties. Run full checks and publish through the existing workflow.


The five studies are complete and published at https://tjetka.github.io/voting_schemes/?view=analyses. [Run 40078714214](https://github.com/TJetka/voting_schemes/actions/runs/40078714214) passed **125 TypeScript unit tests, 10 Python importer tests and all 22 Playwright journeys**, strict type checking, formatting, the repository-subpath build and GitHub Pages deployment on 24 October 2026. The six added browser journeys cover frozen report state, both matrix policies and keyboard navigation, pair versus block maxima, the hypothetical two-party comparison, publication downloads, mobile overflow and print layout.

Independent numerical checks reproduced the baseline 226/234, both 780-cell matrices and all sweep extrema. Publication tests recompute the frozen report, verify Markdown/CSV content and historical input hashes, and distinguish exact whole-block results from internal synthetic-list ties. `npm run analyses:check` verifies the current source and data hashes. The final artifacts identify clean study-source revision `946d9f8`; the artifact commit is `0703d0a`.

Native Chrome inspection verified the live report and its five sections, the complete 780-cell matrix, the 233/227 joint-list result, readable charts and the standalone matrix SVG with all labels visible. The report includes nine standalone SVG figures, 2,284 CSV data rows, Markdown conclusions and a complete JSON input/result export. The app version is 1.2.0; the underlying model remains 1.1.0, and the separately versioned analysis method is 1.0.0. No dependencies, historical source data or CI/CD configuration changed in this adjustment.
