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

Pending implementation. Final results, measured performance and any external deployment blockers will be recorded here.
