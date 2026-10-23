# Agent instructions

Read `prd.md`, `CLAUDE.md` and `IMPLEMENTATION_PLAN.md` before changing this repository.

## Implementation

- Prefer small, pure, typed functions; isolate file IO and UI from mathematics.
- TypeScript strict mode; no `any` in core paths. React renders imported text safely.
- Python uses pathlib, public type hints, clear exceptions, pytest and ruff.
- Validate imported scenarios and source schema. Reject incompatible model/data versions.
- Keep dependency footprint small. No runtime downloads, unsafe deserialization or dynamic code execution.
- Keep changes coherent. Commit milestones and push normally; never force push, rebase or delete branches without explicit authorization.
- Do not alter CI/CD outside the user's explicitly requested scope. This implementation's GitHub Pages workflow is explicitly required by the PRD.
- Never read or print secrets. Never overwrite source data without explicit authorization; a deterministic importer may verify existing artifacts or create a new destination.

## Validation

Run the relevant Vitest subset and `uv run pytest -q` on the relevant importer tests. For core or IO changes run all unit and importer tests, type checking and the production build. Add deterministic behavioral tests, with independent historical fixtures and small synthetic matrices. Browser acceptance tests must cover keyboard grouping, eligibility changes, persistence and repository-subpath refresh. Tests never depend on a live external service.

## Reproducibility

Record source URLs, retrieval metadata, SHA-256, schema/parser/model/data versions and provenance for artifacts. The default dated poll must not be silently replaced. Support edits and grouping comparisons must preserve votes. Preserve historical source data; do not invent missing values or silently adjust regression expectations. Report numerical ambiguity and limitations instead of arbitrary winners.
