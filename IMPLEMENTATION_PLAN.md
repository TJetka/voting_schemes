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

Implementation gates 0–4 are complete. Gate 5 source, production build and automated delivery workflow are complete; automated browser validation passes; Pages is enabled and the final deployment is in progress.

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

The initial deployment was blocked because Pages was disabled. The repository owner enabled GitHub Actions as the Pages source; GitHub now reports `has_pages: true`. A subsequent runner stalled during the browser download, so the delivery workflow uses Playwright’s smaller headless-only Chromium download and a five-minute installation timeout. The final workflow will publish the validated build to https://tjetka.github.io/voting_schemes/; publication is reported only after checking that URL.
