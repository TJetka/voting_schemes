# Official 2023 Sejm baseline

The runtime bundles `src/data/historical.json`; it makes no external data requests.
The two small original KBW ZIP archives in `raw/` are public aggregate district
results. Their SHA-256 hashes and extracted CSV hashes exactly match PRD section
4.4. `src/data/source-manifest.json` records the source URLs, retrieval date,
schema/parser versions and normalized artifact hash.

Run the deterministic import from the repository root:

```sh
python3 scripts/import_pkw.py
uv run pytest -q tests/python
```

This is an offline import using the Python standard library. It verifies existing
generated artifacts byte-for-byte; it refuses to overwrite differing data. To
review a regenerated artifact, choose a new directory:

```sh
python3 scripts/import_pkw.py --output-dir /tmp/pkw-review
```

## Independent seat validation

The district and national control seats are parsed from explicit seat-award
statements in the [official PKW result notice, Dz.U. 2023 poz. 2234](https://eli.gov.pl/eli/DU/2023/2234/ogl).
They are **not** computed by the engine being tested. All 41 district allocations
sum to the mandates in the separate KBW metadata; the notice's national seat
statements independently agree with their sums.

The original PDF endpoint returned HTTP 500 during retrieval. The same official
act was retrieved through [the Sejm API](https://api.sejm.gov.pl/eli/acts/DU/2023/2234/text/O/D20232234.pdf).
`raw/result-notice-source.json` records both URLs, the PDF SHA-256, and extraction
hashes. A lossless gzip of the complete `pdftotext -layout` output is retained as
`raw/D20232234.pdftotext.txt.gz` (about 127 KB); it contains the public notice,
including public candidate results. Re-extracting the PDF requires Poppler;
normal offline imports need no PDF library.

## Data semantics

- Join on district number, never city: commission cities repeat.
- Final electorate comes from the results CSV, not the earlier metadata snapshot.
- Ballot papers (`ballots2023`) and valid list votes (`validVotes2023`) differ.
- Overseas and ship votes are already in district 19; there is no 42nd district.
- Empty committee cells become zero votes and `onBallot: false`.
- KO and Trzecia Droga were formal coalition committees in 2023; the German
  minority committee has the minority exemption. This historical treatment does
  not dictate future scenario committee forms.
- The fixed national and per-district control totals are tested against PRD
  Appendix A. Changing them requires investigating the source, never adjusting
  fixtures just to make a test pass.

Raw snapshots are immutable. An update should use new versioned paths and a new
data version after reviewing source differences. No import downloads or executes
remote code.
