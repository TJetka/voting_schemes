# Source verification record

Checked on **23 October 2026** during implementation. This records actual
retrievals, not an assumption that every PRD citation was independently verified.
The application still uses the fixed versions selected by the PRD.

## Pollster snapshot (S4 and S5)

Both the [Zero.pl report](https://zero.pl/news/nowy-sondaz-partyjny-ko-prowadzi-psl-i-polska-2050-pod-progiem)
and [Onet report](https://wiadomosci.onet.pl/kraj/ko-prowadzi-w-sondazu-wyborczym-duza-przewaga-nad-pis/txqdtnb)
were successfully retrieved and inspected. They agree on Pollster, fieldwork
19–21 October 2026, sample 1,014, and these published percentages:

| Response | Percent |
| --- | ---: |
| KO | 33.54 |
| PiS | 22.06 |
| Konfederacja | 12.18 |
| KKP | 8.03 |
| Nowa Lewica | 7.77 |
| Rozwój Plus | 5.61 |
| Razem | 5.14 |
| PSL | 3.44 |
| Polska 2050 | 1.72 |
| Unia Centrum | 0.15 |
| Other | 0.36 |

Onet explicitly displays publication on **22 October 2026 at 15:33** and cites
Zero.pl. These are two reports of the same survey, not independent polls.
Neither inspected report specifies interviewing mode or undecided-response
treatment. Those fields correctly remain null; no unavailable methodology has
been inferred. PPS is not a separate reported response. `pollSnapshot.lastVerified`
in `src/model/presets.ts` now has an actual implementation-time check supporting
its existing 2026-10-23 value.

The percentages sum to 100%. Interpreting them as valid-list-vote shares,
allocating zero scenario support to inactive PPS, locking the 0.51% residual,
family membership and geographic proxies remain **PRD modelling decisions**.
The reports do not validate those decisions.

## Electoral Code (S1)

The PRD's ISAP URL returned a human-verification page through the web reader;
direct curl followed redirects until its limit. The same consolidated code was
successfully downloaded from the [official Sejm API PDF](https://api.sejm.gov.pl/eli/acts/DU/2011/112/text/U/D20110112Lj.pdf).
Its cover cites Dz.U. 2026 poz. 1261, and page footers show **2026-10-08**.
SHA-256 of the downloaded PDF:

```text
1d11fa82ff6c3301911d77bb179acfb32473f5391d64f499084ff6d4ac0a396d
```

Text extraction and a rendered check of page 145 confirmed inclusive 5%/8%
national thresholds, the minority-exemption provision, and the 3%/5% fallback
when at most one committee meets Article 196. Articles 232–233 on page 162
confirm district d'Hondt allocation, the district-total then precinct comparison
for tied list quotients, and the separate candidate-level lottery. Articles
14–15 assign overseas/ship precincts to the constituency containing Warsaw
Śródmieście; Article 193 specifies 460 seats. The fixed 2023 district mandates,
numerical ambiguity policy and prospective registrations remain model choices.

## Historical sources and import provenance

S2's two original ZIPs and extracted CSVs match all four PRD SHA-256 values.
S3's published national and district seat statements were independently parsed;
see [data documentation](README.md) and the generated source manifest for URLs,
hashes and the official API fallback used for that notice.

The import manifest's null `gitSha` is intentional: the initial import preceded
repository initialization. A later temporary Git metadata directory does not
retroactively identify that initial import. The manifest already records this
limitation, deterministic configuration, parser/data versions, source hashes and
normalized-output hash. No source data or fixtures were changed by this check.
