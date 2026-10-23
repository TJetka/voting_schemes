# PRD Polish Sejm Coalition and Threshold Simulator

Version: 1.1
Prepared: 23 October 2026  
Status: Implemented; family geography adjustment specified below
Deliverable: A small static browser application deployed on GitHub Pages  
Specification language: English  
Application interface: Polish  
Working application title: Laboratorium koalicji

## 1 Product objective

Build an interactive, nonpartisan laboratory for understanding how national support, electoral thresholds, district geography and the grouping of political entities into joint lists change seats in the Polish Sejm.

The principal question is: **with the same electorate and support, which permitted electoral configurations produce at least 231 of 460 seats for a selected parliamentary alliance, and how sensitive is that result to small changes in support?**

The application must explain changes, not just output a seat total. A user should be able to identify whether a result changes because a list qualifies nationally, votes are pooled more effectively in particular districts, or a centre list joins a proposed parliamentary majority.

The AI agent implements the application. The application itself needs no language model, API key, backend, account system or paid service.

### 1.1 Required questions

1. What changes when two or more entities run on a common electoral list?
2. Does their legal treatment as a 5% ordinary committee or an 8% formal coalition change the result?
3. How many lists qualify nationally, and how many actually win seats?
4. Can the left/liberal camp, the right camp, or either camp with selected centre lists reach 231 seats?
5. What range of outcomes exists across all permitted configurations at fixed support?
6. Where do small support changes produce jumps in eligibility, district mandates or the parliamentary majority?
7. How much of a merger's seat gain comes from opponents versus other lists in its own camp?
8. Which conclusions depend on the assumed geographic distribution of support?

### 1.2 Product decisions

| Decision | Required default |
| --- | --- |
| Geographic unit | 41 Sejm electoral districts, identified by official district number |
| Seat distribution | Freeze the official 2023 district mandates, totalling 460 |
| Electorate and turnout baseline | Final 2023 district results, including overseas votes in district 19 |
| Political slots | Four left/liberal, four right, two centre |
| Starting support | Dated Pollster snapshot from 19–21 October 2026 |
| Unmeasured fourth left slot | PPS, inactive with zero separately allocated scenario support |
| Geographic projection | 2023 L/R/C electorates, then within-camp committee profiles, calibrated to exact national support targets (section 6.6) |
| Merger behaviour | Perfect vote pooling, without voter loss or additional mobilisation |
| New joint-list default | Formal coalition committee, 8%; explicit 5% alternative |
| Majority target | At least 231 seats; a majority of the full chamber |
| Turnout model | Proportional scaling of every district's 2023 turnout and valid votes |
| Main comparisons | Manual configurations, exhaustive grouping comparison, sampled sensitivity |
| Deployment | React, TypeScript and Vite; static GitHub Pages |
| Data updates | Versioned repository data; no live scraping when the app opens |

These are implementation decisions. Sources establish the historical inputs and electoral rules; they do not establish the validity of the geographic proxies or the political feasibility of an alliance.

## 2 Scope and completion standard

### 2.1 Required for the first release

- Verified import of 2023 district mandates, electorate, turnout, valid votes and all committee results.
- Historical replay using the actual 2023 committees.
- Ten editable scenario slots with the compatibility rules in section 7.
- One dated polling preset and a clearly labelled synthetic preset that activates all ten slots.
- National support editing with explicit vote conservation.
- Geographic calibration, national eligibility and district d'Hondt allocation.
- Joint-list builder with explicit committee type.
- Camp results and a separate parliamentary-alliance selector.
- Baseline pinning and comparison of up to four scenarios.
- Exhaustive comparison of permitted groupings under a declared committee-type policy.
- One-dimensional support sensitivity with step charts and transition explanations.
- A two-dimensional majority heatmap with visible sampling resolution.
- District table and a quotient-level explanation for a selected district.
- Scenario JSON import/export, CSV results export and shareable URL state.
- Local persistence, reset, source/methodology panel and GitHub Pages deployment workflow.
- Meaningful mathematical, historical and browser acceptance checks.

### 2.2 Deferred

Do not delay the first release for live polling feeds, polling averages, probabilistic forecasts, Monte Carlo confidence intervals, district maps, candidate modelling, internal allocation of a joint list's seats, coalition negotiations, election-law reform controls, demographic microsimulation, differential turnout, migration, or automatic estimation of merger-related voter losses.

A geographic map is optional polish. A searchable district table is mandatory and sufficient.

### 2.3 Definition of done

The user can open a GitHub Pages URL, reproduce the 2023 allocation, load the polling scenario, merge or separate entities, inspect threshold effects, compare all permitted groupings, explore majority transitions and share a reproducible scenario. Every calculated result identifies its inputs and assumptions. No result is labelled a probability or an election forecast.

## 3 Terminology and verified electoral rules

### 3.1 Distinct model objects

| Object | Meaning |
| --- | --- |
| Entity | One of the ten configurable political actors; the atomic support unit |
| Electoral list/group | A set of entities running together under one committee; the seat-owning unit |
| Formal coalition committee | A specific legal committee type; normally subject to 8% |
| Parliamentary alliance | A selected set of elected lists whose seats are summed |
| District | Okręg wyborczy; the unit with a fixed number of Sejm mandates |
| Precinct | Obwód głosowania; a smaller voting unit, relevant to some tie-breaks |
| Camp | An explicit analytical grouping, L, R or C; not an inferred political commitment |

A political alliance, a legal coalition committee and a post-election parliamentary alliance are separate concepts.

### 3.2 Rules to implement

The Electoral Code inspected for this specification is the official consolidated text dated 8 October 2026. Relevant provisions are Articles 193, 196–198 and 232–233, with overseas assignment in Articles 14–15. [S1]

- Apply eligibility nationally, against **all valid votes for lists**, including votes for ineligible committees.
- Ordinary committees qualify at **at least 5%**; formal coalition committees at **at least 8%**.
- Support exactly equal to the applicable threshold qualifies.
- A qualifying national-minority exemption is an explicit property.
- If at most one committee meets the ordinary Article 196 thresholds, apply the Article 198 fallback: **3% ordinary / 5% coalition**. A minority committee below the ordinary threshold does not count towards that trigger merely because it is exempt.
- After national eligibility, allocate seats independently in each district using d'Hondt divisors 1, 2, 3 and so on.
- At an equal final quotient, use the higher district list vote total; if totals also tie, the statutory next criterion uses precinct-level comparisons. Do not invent those comparisons.
- The candidate-level lottery in Article 233 must not be presented as a list-level tie rule.

Use **231 seats** as the requested control indicator. Do not describe 231 as the number universally required to pass every parliamentary vote.

The first release intentionally uses the 2023 district seat distribution. Label it accordingly; do not silently substitute population-proportional mandates or assume that future district changes have been incorporated.

### 3.3 Necessary modelling assumptions

All active simulated lists are assumed to register valid lists in all 41 districts and to have enough candidates. Historical replay retains actual registration coverage. Minority exemption support is needed in the engine and historical replay; none of the ten default scenario entities receives an exemption.

A joint list's political name does not determine its legal threshold. In particular, a name containing “Koalicja” is insufficient evidence to set an 8% threshold.

## 4 Historical data and reproducibility

### 4.1 Authoritative downloads

Use the official KBW archive index [S2] and these two files:

- District metadata: https://danewyborcze.kbw.gov.pl/dane/2023/sejmsenat/okregi_sejm_csv.zip
- Final votes by Sejm district: https://danewyborcze.kbw.gov.pl/dane/2023/sejmsenat/wyniki_gl_na_listy_po_okregach_sejm_csv.zip

Their extracted files are:

- okregi_sejm_utf8.csv
- wyniki_gl_na_listy_po_okregach_sejm_utf8.csv

Both are UTF-8, semicolon-separated. Handle a possible BOM. Join by district number, never by city name. Preserve the official boundary descriptions.

The official election results notice [S3] supplies independent national and district seat results for validation.

### 4.2 Exact field mapping

| Internal field | Source and exact column |
| --- | --- |
| districtId | District metadata: Numer okręgu; results: Nr okręgu |
| seats | Metadata: Liczba mandatów |
| commissionSeat | Metadata: Siedziba OKW |
| boundaryDescription | Metadata: Opis granic |
| eligible2023 | Results: Liczba wyborców uprawnionych do głosowania |
| ballots2023 | Results: Liczba kart ważnych |
| invalidVotes2023 | Results: Liczba głosów nieważnych |
| validVotes2023 | Results: Liczba głosów ważnych oddanych łącznie na wszystkie listy kandydatów |
| committeeVotes2023 | The separate result columns for each 2023 committee |

Use final eligible voters from the **results** file. The metadata file's “Wyborcy” column is a different snapshot.

Valid ballot papers and valid votes are different quantities. The former supplies the official final turnout numerator; the latter supplies party totals, threshold denominators and d'Hondt inputs.

Blank committee cells can become zero allocation votes, while an onBallot flag preserves absence from that district. Do not treat blank cells as missing district totals.

### 4.3 Required checks

| Quantity | Expected value |
| --- | ---: |
| Districts | 41 |
| Seats | 460 |
| Eligible voters | 29,532,595 |
| Valid ballot papers | 21,966,891 |
| Valid votes for lists | 21,596,674 |
| Invalid votes | 370,217 |
| Exact baseline turnout | 21,966,891 / 29,532,595 |
| Displayed turnout | 74.38% |

For every district, valid votes plus invalid votes must equal valid ballot papers. Committee votes must sum to valid votes.

Overseas and ship votes are already assigned to district 19 in the official totals. Never add a 42nd district or add those votes a second time.

The appendix provides all 41 district control totals. Official commission cities repeat; always display the district ID as part of its label.

### 4.4 Data provenance

Commit raw source files or their small compressed originals, the deterministic importer, normalized JSON and a source manifest. The manifest records source URL, retrieval date, SHA-256, election date, schema version and parser version.

Checksums observed during preparation:

| File | SHA-256 |
| --- | --- |
| okregi_sejm_csv.zip | 275b0617e81bf1643f0139d279873cbec8d8fb6c14b6fd3657345dd3d26e5a1c |
| wyniki_gl_na_listy_po_okregach_sejm_csv.zip | 7565b8fa5102f64c0435e994ad11369672a1948987ed639b12ad82da72005b03 |
| okregi_sejm_utf8.csv | 23db1510fb408edd5600b640faa54ab30daae373ad146d254ba25852218f0858 |
| wyniki_gl_na_listy_po_okregach_sejm_utf8.csv | fe994644d3c1fc5f3f3c19edb1dc4df55d648b86693763fbaf68811d70c4a599 |

If a fresh download differs, inspect and explain it; do not replace expected values simply to pass tests. A source download failure must not cause the agent to invent district data.

## 5 Dated polling preset and ten political slots

### 5.1 Default snapshot

Use the Pollster survey conducted **19–21 October 2026**, reported on **22 October 2026**, sample **1,014**. The public report supplies a distribution summing to 100%. It does not disclose interviewing mode or treatment of undecided respondents. Store those methodology fields as null and display “not reported”. [S4, S5]

For this simulator, explicitly interpret that published distribution as the scenario's distribution of valid list votes. This is an input convention, not a claim about the undisclosed polling method.

Do not automatically replace this snapshot with a later poll during implementation. Additional polls should be separately dated presets.

### 5.2 Slot definitions

| ID | Family | Entity label | Initial scenario share | 2023 geographic proxy |
| --- | --- | --- | ---: | --- |
| ko | L | Koalicja Obywatelska | 33.54% | KO |
| nl | L | Nowa Lewica | 7.77% | Nowa Lewica |
| razem | L | Partia Razem | 5.14% | Nowa Lewica |
| pps | L | Polska Partia Socjalistyczna | 0.00% | Nowa Lewica |
| pis | R | Prawo i Sprawiedliwość | 22.06% | PiS |
| konf | R | Konfederacja Wolność i Niepodległość | 12.18% | Konfederacja |
| kkp | R | Konfederacja Korony Polskiej | 8.03% | Konfederacja |
| rozwoj | R | Rozwój Plus | 5.61% | PiS |
| psl | C | Polskie Stronnictwo Ludowe | 3.44% | Trzecia Droga |
| pl2050 | C | Polska 2050 | 1.72% | Trzecia Droga |

These are political entities for simulation; the application must not assert that every named organisation is already a registered electoral party or has a registered future committee.

Label L **“Lewica / liberałowie — grupa scenariusza”**. KO's assignment is an analytical convention; do not describe all L entities as ideologically left-wing. Allow renaming the scenario families and entities. The fixed 4/4/2 compatibility structure remains the MVP default.

PPS is a current real organisation [S6], but the selected poll does not separately measure it. Store publishedPollSharePct as null, scenario share as zero, status as unmeasured, and active as false. Display “Brak osobnego pomiaru; 0% przydzielone w scenariuszu”. Never present that zero as a poll finding.

Activating PPS requires an explicit support transfer. Suggested demonstration: transfer 1 percentage point from NL to PPS, leaving the L total unchanged. Save this as **“Dziesięć podmiotów — scenariusz syntetyczny”**, separately from the polling preset.

### 5.3 Residual votes

Preserve **0.15% Unia Centrum + 0.36% other = 0.51%** as a locked residual outside the ten interactive slots. Keep both published components in source metadata.

This residual:

- stays in the national denominator and geographic fit;
- is assumed not to win seats in this preset;
- is not an eleventh mergeable political entity;
- cannot qualify as one invented “Other” committee;
- cannot receive support through the default donor mechanism.

This is a deliberate simplification of the ten-slot preset. Adding a materially larger residual or separately modelling Unia Centrum belongs to a later expanded-entity version.

### 5.4 Poll provenance and uncertainty

Retain raw published shares separately from editable scenario shares. Display pollster, fieldwork dates, publication date, sample, source, denominator convention and date last verified. Mark changes to support as user assumptions.

For later poll imports with undecided respondents, require an explicit conversion to a valid-vote distribution. Do not apply legal thresholds directly to a denominator containing undecided answers. A dated poll selector is preferable to an undocumented average.

## 6 From national support to district votes

This section defines the projection completely. It is a transparent scenario model, not a district forecasting model. The user-requested adjustment in section 6.6 is the default from model 1.1.0; sections 6.2–6.3 also remain available as the original individual-profile comparison.

### 6.1 Notation

- d: district, 1 through 41.
- i: atomic political entity, plus the residual column.
- m_d: district seats.
- E_d: final 2023 eligible voters.
- B_d: 2023 valid ballot papers.
- V_d: 2023 valid votes for lists.
- N = sum_d V_d.
- s_i: requested national share as a fraction, with sum_i s_i = 1.
- w_d = V_d / N.
- H_dq: actual 2023 votes in district d for historical committee q.
- h_q = sum_d H_dq / N.

### 6.2 Individual-profile geographic seed (retained comparison mode)

Each entity selects the historical proxy in section 5. For that proxy q:

    r_di = (H_dq / V_d) / h_q
    rSmoothed_di = 0.99 * r_di + 0.01
    Y_di = w_d * s_i * rSmoothed_di

For the residual, use r_di = 1.

The 1% uniform component is a numerical/model regularizer, not an empirically estimated migration of support. Fix it at 0.01 in model version 1 and expose it in methodology metadata.

Entities sharing a proxy do not each inherit its historical vote total. Their national totals are set independently by s_i; the proxy supplies only geographic shape.

Provide a comparison geography mode, **“Jednakowe poparcie w każdym okręgu”**, where r_di = 1 for all entities. This makes geographic assumptions inspectable without a complex geographic editor.

### 6.3 Calibration by iterative proportional fitting

Fit Y to both margins:

    sum_i Y_di = w_d
    sum_d Y_di = s_i

Algorithm:

1. Remove zero-target columns from the iterative computation; restore them as exact zeros afterward.
2. Initialize the positive active matrix with the formula above.
3. Rescale each active column to its target s_i.
4. Rescale each row to its target w_d.
5. Repeat steps 3–4 until the maximum absolute row or column error is at most 1e-12.
6. Allow at most 10,000 iterations; a failure produces a visible model error, never a silent fallback.
7. Set expected atomic votes X_di = N * Y_di.

Compute in Float64 using stable loops. The positive regularizer and positive margins avoid structural-zero infeasibility for active entities.

A national-only multiplicative swing followed by district row normalization is insufficient: it generally changes the national shares the user entered. Both sets of margins must be preserved.

### 6.4 Merger invariant

For a joint list G:

    X_dG = sum over i in G of X_di
    s_G = sum over i in G of s_i

**Calibrate atomic entities once per support/geography scenario. Pool columns afterward. Never rerun calibration merely because the grouping changed.**

Do not change support, turnout, opponents' votes or district geography when a user drags entities into one list. Comparing groupings must isolate grouping and eligibility effects.

### 6.5 Proportional turnout control

Use:

    t0 = sum_d B_d / sum_d E_d
    c = requestedTurnout / t0
    expectedBallots_d = c * B_d
    expectedValidVotes_d = c * V_d
    expectedEntityVotes_di = c * X_di

Keep the electorate E_d fixed and the district valid-vote ratio V_d/B_d fixed.

This changes expected numbers of voters and valid votes but **cannot change national shares, eligibility or seats**. Calculate seats from the unscaled canonical matrix. Round only displayed headcounts.

Display next to the control:

> Przy proporcjonalnej zmianie frekwencji w każdym okręgu liczba mandatów się nie zmienia. Zmienia się liczba głosujących.

For a literal turnout interpretation require:

    0 < requestedTurnout <= t0 * min_d(E_d / B_d)

For the supplied data, the ceiling is approximately **85.8375467%**, with district 19 limiting. Derive this from the data. On a slider with 0.01-point steps, use an upper selectable value of 85.83%, not a rounded-up invalid value. Preserve the exact baseline t0 even though its displayed value is 74.38%.

Never silently cap individual districts at 100%: that would change the user's proportional model. Zero turnout is an invalid/no-election input.

Differential turnout is deferred. It would require an explicit model of whose participation changes.


### 6.6 Regional electorates and within-camp heterogeneity (model 1.1.0)

Requested adjustment: use 2023 regional voting baselines within the left/liberal, right and centre electorates while retaining every national poll share. The default geography mode is `family`; `historical` retains the original individual-profile fit and `uniform` remains the geography-free comparison.

Define historical camp votes once, without weighting them by today's party mix:

- L = 2023 KO + Nowa Lewica.
- R = 2023 PiS + Konfederacja.
- C = 2023 Trzecia Droga.

These are analytical electorates, not observations of individual voter transfers. Other 2023 committees do not enter a named camp; all valid votes remain in district weights and national denominators. The scenario residual remains a separate column with a uniform seed, calibrated alongside camps.

**Stage 1 — district camp totals.** Let `H_df` be historical camp votes, `H_f` their national sum and `s_f` the exact integer sum of current entity support in that camp. Seed with:

    r_df = (H_df / V_d) / (H_f / N)
    Y_df = w_d * s_f * (0.99 * r_df + 0.01)

Fit district totals `w_d` and current national camp totals `s_f`, including the residual. Thus a camp's regional distribution depends on its national total, not on its internal party composition.

**Stage 2 — entities within each camp.** Let `A_df` be stage 1's fitted district camp share in national valid-vote units. For entity i and its historical proxy q, use conditional historical geography:

    r_di_given_f = (H_dq / H_df) / (H_q / H_f)
    Z_di = A_df * (s_i / s_f) * (0.99 * r_di_given_f + 0.01)

Within each camp, fit rows to `A_df` and columns to exact national party targets `s_i`. Skip an entirely zero-support camp; keep zero entity columns exactly zero. There are no zero historical L/R/C district denominators in the verified input. Parties with a shared proxy retain identical within-camp geographic shape: in particular the 2023 committee data cannot identify separate PSL and Polska 2050 regional electorates.

Fit both stages column-then-row. Stage 1 uses tolerance `1e-12 / 16`, stage 2 `1e-12 / 8`; verify the combined matrix satisfies the original `1e-12` absolute normalized margin tolerance. The iteration limit applies separately to each fit, and diagnostics report total iterations and maximum margin error across stages and the final matrix.

Required invariants: every party's valid-vote-weighted national share equals its scenario target (the published poll unless edited); every district retains its 2023 valid-vote total; moving support within a camp preserves that camp's total in every district and every other camp's atomic votes; merging lists only pools already fitted columns. Uniform turnout remains seat-invariant.

Display national target versus reconstructed weighted shares, searchable 2023 versus scenario district camp profiles, and explicit proxy limitations. Arithmetic averages of district percentages are not national vote shares. Existing model 1.0.0 exports and links retain their original modes and results; adopting the new geography is explicit. New scenarios and exports use 1.1.0. The 1.0.0 model cannot declare the new `family` mode.

## 7 Grouping rules and majority accounting

### 7.1 Allowed electoral configurations

Each active entity occurs in exactly one list. Lists are nonempty and disjoint.

A list is permitted if it contains:

- only L entities;
- only R entities;
- only C entities;
- L and C entities;
- R and C entities.

A list containing both L and R is forbidden, including an L–C–R combination. Centre entities cannot bridge that restriction.

Changing an entity's active status must be explicit. Deactivating a positive-support entity requires transferring its support first. Dormant zero-support slots do not enter grouping enumeration or create coalition-threshold changes.

Enforce inactive implies supportUnits = 0. An active entity may reach zero support during a sweep and remains in its existing list; only explicit deactivation changes the partition or the set being enumerated. Its zero column is omitted from the numerical fit, not from its chosen electoral arrangement.

### 7.2 Committee type

Every list stores committeeType independently of membership:

| Value | Normal threshold | UI description |
| --- | ---: | --- |
| ordinary | 5% | Wspólna lista w jednym komitecie — założenie 5% |
| coalition | 8% | Koalicyjny komitet wyborczy — 8% |

Singletons default to ordinary. A newly created multi-entity list defaults to coalition; show the 8% badge immediately and provide the explicit ordinary alternative. Do not silently switch an established list's legal treatment when editing it.

The chosen legal treatment is a scenario assumption about a valid electoral arrangement. The app does not perform committee registration or determine whether an organisation has completed it.

### 7.3 Seat ownership and analytical camps

Seats belong to lists. Do not apportion a joint list's seats between member entities using a second d'Hondt calculation or proportional percentages. Actual internal seats depend on candidates and preference votes, which are outside this model.

For default camp summaries:

- a list containing L entities is L-aligned;
- a list containing R entities is R-aligned;
- a centre-only list is uncommitted C.

Attaching a centre entity to an L or R list therefore includes an explicit assumption that the whole common list supports that camp. Label this assumption.

Show L + R + C = 460 in ordinary, fully resolved scenarios. For historical replay, allow an additional “Other / minority” category.

### 7.4 Parliamentary alliance selector

Provide checkboxes over whole elected lists. Sum each selected list once, with a clear 231 marker.

The checkbox selection belongs to that exact list partition. After a merge or split, preserve selections for unchanged lists, remove selections for altered lists, and leave newly formed lists unselected. Show a notice that the parliamentary alliance needs review. Never silently transfer an obsolete list ID to a different group. Pinned scenarios retain their own selections.

Also show alternative possibilities “L + selected centre lists” and “R + selected centre lists” when relevant. These are separate prospective alliances, not two simultaneous allocations of the same centre MPs.

Use “majority of seats under the selected alliance assumption”. Do not infer confidence votes, voting discipline or guaranteed formation of a government.

## 8 Eligibility and d'Hondt calculation

### 8.1 Exact national thresholds

Store editable national support in integer units of **0.000001 percentage point**:

    100% = 100,000,000 units
    5% = 5,000,000 units
    8% = 8,000,000 units

This comfortably fits safe JavaScript integers. Parse inputs as decimal strings rather than introducing binary rounding before conversion. Sum list shares in these units.

Compare thresholds to these authoritative margins, not approximate IPF column sums.

For historical replay, compare exact vote counts by cross multiplication, for example:

    100 * committeeVotes >= thresholdPct * allValidVotes

Evaluate ordinary eligibility first, apply Article 198 if required, then include valid minority exemptions. Do not renormalize away excluded votes before checking eligibility.

If a district has no positive votes for an eligible list, return an explicit unallocatable state rather than fabricating mandates. Under the normal ten-slot model this should not occur, but imports and tests must handle it.

### 8.2 District allocation

For each eligible list G in district d, consider:

    quotient(G, k) = X_dG / k
    k = 1, 2, ..., m_d

Award the m_d largest quotients. Sum district results for national seats.

An incremental highest-quotient allocator is acceptable for performance. Preserve enough data to reconstruct the final winning and first losing quotients and the allocation trace for any selected district.

Historical replay uses integer votes and exact cross-products, using BigInt where appropriate. Simulation uses unrounded expected votes. Never allocate from percentages rounded for display.

### 8.3 Ties and numerical ambiguity

For exact historical quotient ties, first compare district list totals exactly. Use precinct comparison data only if it is genuinely available. The verified 2023 replay has no unresolved final-quotient ties.

For projected votes, compare quotient cross-products with a documented relative tolerance of 1e-12 on their magnitude. Re-evaluate close boundaries with higher precision or report numerical ambiguity; never silently award the seat alphabetically. Do not claim that approximate equality is proof of an exact legal tie.

Do not use epsilon equality inside a sorting comparator: it can be nontransitive. Order computed values consistently, inspect a boundary neighbourhood relative to one reference cutoff, then refine or report ambiguity. A numerical near tie must not invoke the legal higher-district-vote tie-break unless exact quotient equality has been established. If refinement is used, refine the vote projection as well as quotient arithmetic rather than merely adding digits to already rounded values.

When the available tie-break information is insufficient, retain a set of unresolved boundary seats. Show seat intervals and a visible reason.

For r remaining seats contested by k tied boundary lists, of which t belong to a selected alliance, its possible additional seats are:

    lower = max(0, r - (k - t))
    upper = min(r, t)

Use this formula only after applicable available tie-breaks have been applied. Sum independent district bounds for a fixed alliance. Marginal per-list upper bounds need not be simultaneously achievable.

For numerical ambiguity rather than an established exact tie, present the resulting bounds as conservative numerical bounds, not proof that every interior seat count is attainable.

Majority labels:

- lower bound >= 231: majority under every unresolved boundary outcome;
- lower < 231 <= upper: majority depends on the unresolved boundary;
- upper <= 230: below the majority threshold.

## 9 User experience

### 9.1 Layout

Use a desktop-first, responsive workspace with three main tabs:

1. **Koalicje** — support editor, list builder, immediate results.
2. **Wszystkie konfiguracje** — exhaustive comparison.
3. **Wrażliwość** — one-dimensional and two-dimensional experiments.

Keep a compact result bar visible across tabs: L seats, R seats, uncommitted centre seats, selected alliance seats, majority status and number of eligible lists.

Show the source date and “Model scenariuszowy” next to the preset name. Present the detailed methodology in a drawer, without requiring users to read it before operating the app.

Use accessible colours and text labels. A colour must never be the only indicator of family, threshold status or majority.

### 9.2 Support editor

Show ten entity rows, with:

- name, family, measured/unmeasured status and active state;
- numeric support input and slider;
- source share versus edited share;
- geographic proxy indicator;
- lock control.

Support must always sum to 100% including the residual.

When changing entity i from its current share to x, select a funding pool of unlocked entities D. Keep all other shares fixed. Let M be the old total of i plus D:

    newShare_i = x
    newShare_j = oldShare_j * (M - x) / sum(oldShare_D), for j in D

Use deterministic largest-remainder rounding to support units so the sum remains exact. Reject x outside [0, M]. A funding pool with zero total requires an explicit alternative donor choice.

Use BigInt or exact rational arithmetic for the proportional-allocation numerators, integer division and remainder comparisons: multiplying two support-unit values can reach 10^16 and exceed JavaScript's safe-integer range. Convert only the final bounded allocations back to Number. Resolve equal remainders by stable entity ID, not the displayed row order.

Default donors are all other active, unlocked entities. Offer “within this family” and “selected donor” choices. Display the chosen funding rule before the change and show affected rows afterward. Never change the entered target through hidden renormalization.

A fixed-family-total editing mode lets the user redistribute L, R or C support without changing the family's total. Offer equal division among a selected number of slots as a labelled synthetic experiment, not a polling estimate.

### 9.3 Coalition builder

Display entity chips inside list cards. Users can:

- select chips and choose “Połącz”;
- move entities between compatible cards;
- split an entity back into its own list;
- switch a list's 5%/8% treatment;
- reset all lists to separate;
- merge all L or all R;
- attach either centre entity to a selected compatible list.

Support drag-and-drop as an enhancement. Every action must also work with buttons, keyboard and touch selection.

Each card shows combined support, legal threshold, qualification status, national seats and change from the pinned baseline. Prevent forbidden L–R combinations before applying them and explain the restriction.

Provide undo/redo for support and grouping edits.

### 9.4 Results and comparison

Mandatory outputs:

- seats by electoral list;
- camp totals and selected parliamentary alliance;
- majority surplus/deficit relative to 231;
- number of running lists;
- number qualifying nationally;
- number actually winning at least one seat;
- share of valid votes cast for ineligible lists;
- seats gained/lost versus the pinned baseline;
- affected districts and their seat transfers.

Use **“votes for ineligible lists”**, not a claim that every vote failing to elect a representative has been individually classified.

For a merge, distinguish:

1. change in the merged members' combined seats;
2. change in other lists in the same camp;
3. net camp change;
4. change in the opposing camp and uncommitted centre.

Allow four pinned scenario cards and a compact comparison table. The baseline must remain frozen when the working scenario changes.

### 9.5 District inspector

Mandatory table columns: ID, commission location, seats, eligible voters, baseline turnout, scenario turnout, expected valid votes, seats by list and change from baseline.

Clicking a district opens:

- list votes and shares;
- national eligibility and reason;
- the final winning quotient and the strongest losing quotient;
- divisors involved;
- quotient gap, explicitly distinguished from a national vote swing;
- the actual seat transfers relative to the comparison scenario.

A quotient gap is not automatically the number of votes needed to flip a mandate under a national support redistribution.

## 10 Exhaustive configuration explorer

### 10.1 Enumeration

Generate canonical set partitions of active entities while enforcing section 7. Sort member IDs and blocks canonically so card order never creates duplicate scenarios.

At fixed entity support and geography:

1. Calibrate atomic votes once.
2. Enumerate permissible partitions.
3. Apply the selected common committee-type policy.
4. Calculate eligibility and district seats.
5. Cache the results.

Provide two clearly labelled policies:

- each multi-entity list uses the formal 8% coalition treatment;
- each multi-entity list uses the ordinary 5% treatment.

Singletons use 5% in both policies. Manual scenarios may use mixed treatments, but exhaustive mode does not silently claim to enumerate every independent combination of legal forms.

Exact grouping counts for validation:

| Active families | Permitted partitions |
| --- | ---: |
| 4 L, 4 R, 2 C | 8,378 |
| 3 L, 4 R, 2 C | 2,385 |

The second count applies to the polling preset with PPS inactive. These counts exclude the residual and count groupings, not alternative legal-form assignments.

For 4/4/2, the counts by number of lists from 2 to 10 are:

    4, 131, 1075, 2713, 2807, 1324, 294, 29, 1

Run enumeration and evaluation in a Web Worker with progress and cancellation. A new edit must invalidate or cancel stale work; never display old results under new inputs.

### 10.2 Presentation

Define the explorer's comparable alliance rules independently of changing list IDs:

- L-aligned lists only;
- R-aligned lists only;
- L-aligned lists plus every centre-only list;
- R-aligned lists plus every centre-only list.

Centre entities already attached to the opposite camp are not centre-only lists and are not added by these rules. Recompute the rule from membership in each partition. Arbitrary whole-list checkbox selections from the manual builder do not transfer across partitions; clicking a result opens its concrete lists for a new manual selection.

Show an interactive scatter/strip plot:

- x: number of nationally eligible lists;
- y: seats for the selected camp or selected alliance rule;
- colour: majority status;
- tooltip: grouping, legal policy, camp totals, ineligible vote share.

Use deterministic visual jitter only to separate overlapping points; the tooltip reports exact integer values.

Below, provide a sortable table and filters for list count, eligible-list count, particular entities being together/separate, centre placement and majority status. Clicking a result opens that exact configuration in the manual builder.

For each eligible-list count show minimum, maximum and the full accessible set of outcomes. Equal numbers of qualifying lists can produce different seat results.

The number of qualifying lists is an **output and filter**, not an independently adjustable causal parameter. A change to it must arise from an explicit grouping or support change.

If reporting that a fraction of enumerated scenarios produces a majority, call it a **fraction of configurations**, never an election probability.

## 11 Sensitivity experiments

### 11.1 One-dimensional experiment

A sweep has an explicit target entity, funding rule, fixed list configuration, legal treatment, range and step.

Default example: vary Razem around its threshold while financing the change from NL, with the two lists separate. Offer the merged version as a comparison.

At each point:

1. construct the complete, vote-conserving national support vector;
2. recalibrate atomic geography;
3. pool list columns;
4. evaluate national eligibility;
5. allocate district seats.

Construct every sample independently from the same frozen starting support vector and funding definition. Do not incrementally modify the preceding sample; that would introduce rounding drift and make results depend on sweep direction.

Show step charts for selected list seats, camp seats, selected alliance seats and eligible-list count. Draw the 231 line on relevant seat charts.

Default resolution: 0.01 percentage point, with at most 2,001 sample points per run. Offer local zoom at 0.001 percentage point while keeping that cap. Display range, resolution and sample count.

Where the chosen support path crosses a known national threshold, explicitly evaluate the threshold and the immediately adjacent representable support values. National threshold events can be exact; district seat transitions between samples remain intervals.

Show a transition log with:

- support interval or exact national threshold;
- lists gaining/losing eligibility;
- districts changing allocation;
- seats moving between lists;
- majority status before and after.

Do not smooth steps into continuous seat curves. Do not claim all district breakpoints were found. Do not label the first sampled majority as an exact minimum swing. A local refinement must remain labelled with its achieved resolution.

### 11.2 Two-dimensional experiment

Default axes:

- x: Razem support, financed from NL;
- y: Rozwój Plus support, financed from PiS.

This preserves each selected family's total and keeps the two donor pools disjoint. Let users choose other target/donor pairs, but reject conflicting or overlapping funding definitions in the MVP.

Colour a grid by selected alliance's seat total or majority category. Include a legend and exact tooltip for each cell. Draw no smoothed boundary implying precision finer than the grid.

Default: at most 41 x 41 cells. Offer a selected-area refinement up to 101 x 101. Invalid combinations with negative support are blank and labelled invalid, not automatically renormalized.

Only the currently chosen configuration and optional pinned comparison are swept. Do not multiply every heatmap cell by every coalition partition in the first release.

### 11.3 How to interpret merger effects

Under fixed votes, unchanged eligibility, unchanged opponents and no cutoff ties, pooling lists cannot reduce their combined d'Hondt seats. The gain can be zero, and its size changes discretely.

This is a mathematical property of the specified model. It does not imply that every politically realistic merger improves the result: an 8% legal threshold can change eligibility, and real mergers can change voter behaviour, which the first release does not model.

Even when the merging lists gain seats, some gains can come from other lists in the same camp. The app must report the net camp effect separately.

With perfect retention and a common 5% committee, extensive merging can be mechanically dominant. Do not introduce undocumented voter movements to make the analysis appear more complicated.

## 12 State model and implementation architecture

### 12.1 Core records

Use typed, versioned records with at least these fields:

| Record | Required fields |
| --- | --- |
| District | id, commissionSeat, boundaryDescription, seats, eligible2023, ballots2023, validVotes2023, invalidVotes2023, votesByCommittee |
| Entity | id, label, family, active, supportUnits, publishedPollSharePct or null, supportStatus, proxyId, locked |
| Residual | component labels and published shares, fixed supportUnits, eligibilityAssumption |
| ElectoralList | id, memberEntityIds, committeeType, minorityExempt |
| PollSnapshot | id, pollster, fieldworkStart, fieldworkEnd, publicationDate, sampleSize, mode or null, sourceUrls, rawResponses, denominatorConvention |
| Scenario | schemaVersion, modelVersion, dataVersion, pollId, entities, lists, residual, turnout, geographyMode, allianceSelection, notes |
| Result | status, eligibility, thresholdRegime, districtAllocations, nationalListSeats, campSeats, allianceSeats or bounds, excludedVoteShare, warnings |
| Sweep | target/donor definitions, range, grid, scenario fingerprint, resolution, sampled results, transition log |

Serialize BigInt values as strings where needed. Do not serialize derived results as authoritative scenario inputs.

### 12.2 Suggested source layout

Use a small modular project:

    src/model/types.ts
    src/model/validation.ts
    src/model/support.ts
    src/model/geography.ts
    src/model/eligibility.ts
    src/model/dhondt.ts
    src/model/coalitions.ts
    src/model/alliances.ts
    src/model/sensitivity.ts
    src/workers/explorer.worker.ts
    src/components/
    src/data/
    scripts/import-pkw.ts
    data/raw/
    tests/
    public/
    .github/workflows/

The election engine must be pure and testable without React. The UI and Worker must call the same engine. Derived state should be memoized from a canonical scenario fingerprint.

Use React + TypeScript + Vite and simple CSS. Choose a small chart library or SVG/Canvas implementation appropriate to step charts, scatter plots and grid heatmaps. Avoid a global state framework unless actually needed; a reducer and selectors are sufficient.

Pin dependency versions in the lockfile when implementing. Use a supported Node LTS version compatible with the selected tooling and declare it in project configuration.

### 12.3 Data and state persistence

- Bundle normalized JSON so the app works without external data requests.
- Save the latest working scenario locally with a schema/model version.
- Export and import a complete scenario JSON.
- Share compact scenario parameters in the URL hash, preserving the GitHub Pages project path.
- Include data and model versions in shared state; show a compatibility error if they cannot be reproduced.
- Validate imported JSON strictly, including unique IDs, support sum, allowed lists and known proxy IDs.
- Treat imported labels as text, never HTML.
- Allow reset to the unedited dated preset.
- CSV exports include scenario ID, model/data versions, list membership, threshold treatment, national support, seats and district outputs as appropriate.

### 12.4 Performance and accessibility targets

Target on a documented ordinary desktop browser:

- single scenario update: under 100 ms after inputs settle;
- expensive sweeps and all-partition evaluation: Worker-based, cancellable, with progress; target under 10 seconds for the default exhaustive run;
- avoid synchronous main-thread tasks longer than 100 ms;
- support keyboard operation, visible focus, labelled controls and accessible tabular alternatives to charts;
- maintain usable controls at a 390 px viewport;
- no network polling, analytics service or authentication required.

Debounce continuous slider changes and discard outdated Worker results using a request ID. If computation exceeds the target, retain correctness and progress feedback while optimizing; do not silently reduce the enumerated space.

## 13 Verification and acceptance criteria

### 13.1 Historical replay gate

Load actual 2023 committee votes directly. Bypass polling projection and the ten-slot setup.

Use actual 2023 committee treatment: KO and Trzecia Droga as formal coalitions, the ordinary committees as recorded, and Mniejszość Niemiecka as exempt.

Required national result [S3]:

| Committee | Seats |
| --- | ---: |
| PiS | 194 |
| KO | 157 |
| Trzecia Droga | 65 |
| Nowa Lewica | 26 |
| Konfederacja | 18 |
| Mniejszość Niemiecka | 0 |
| Other committees | 0 |
| Total | 460 |

Compare every district against the independently published official district allocation, not only this national vector. Do not generate “expected” district allocations by rerunning the same algorithm under test.

Historical reproduction validates import and electoral allocation. It does not validate the predictive accuracy of the current geographic proxies.

### 13.2 Mathematical and state invariants

Required meaningful tests:

1. Exactly 41 district IDs; each district allocates its mandated seats and the national total is 460 when resolved.
2. National support, including residual, sums exactly to 100%.
3. IPF preserves both margins within 1e-12 in normalized units; zero-support columns stay zero.
4. Exact 5.00% and 8.00% qualify, immediately lower values do not under ordinary rules.
5. Below-threshold votes remain in the eligibility denominator.
6. Article 198 applies only under the defined ordinary-qualifier condition, with correct 3%/5% fallback.
7. A below-threshold minority exemption does not by itself prevent the fallback trigger.
8. Uniform turnout changes preserve all seats and eligibility exactly.
9. Pooling lists preserves every atomic district vote and never triggers recalibration.
10. Entity duplication and every L–R mixed list are rejected, including combinations containing centre entities.
11. Permuting entity/list order does not change resolved results.
12. Exact ties and numerical ambiguity produce explicit outcomes rather than array-order winners.
13. Grouping enumeration produces 8,378 and 2,385 in the stated cases.
14. Merger weak nonloss holds in generated tie-free examples where eligibility and opponents are unchanged.
15. JSON/URL round-trips preserve scenario results; invalid imports fail with actionable messages.
16. Stale Worker responses cannot overwrite newer scenarios.

### 13.3 Synthetic allocation fixtures

Use one 20-seat district and the national percentages shown. All ordinary separate lists use 5%. The examples have no tie at the seat cutoff.

| Purpose | Separate vote shares A / B / C / D | Separate seats A / B / C / D | Merged treatment | Merged seats AB / C / D |
| --- | --- | --- | --- | --- |
| Coalition threshold loss | 5.1 / 2.8 / 46 / 46.1 | 1 / 0 / 9 / 10 | AB at 7.9%, formal 8% | 0 / 10 / 10 |
| Same votes, lower legal threshold | 5.1 / 2.8 / 46 / 46.1 | 1 / 0 / 9 / 10 | AB at 7.9%, ordinary 5% | 1 / 9 / 10 |
| Threshold rescue | 3 / 3 / 47.1 / 46.9 | 0 / 0 / 10 / 10 | AB at 6%, ordinary 5% | 1 / 10 / 9 |
| Pooling plateau | 10 / 10 / 40.1 / 39.9 | 2 / 2 / 8 / 8 | AB at 20%, formal 8% | 4 / 8 / 8 |
| Pooling gain | 8 / 8 / 42.1 / 41.9 | 1 / 1 / 9 / 9 | AB at 16%, formal 8% | 3 / 9 / 8 |

Also construct dedicated fixtures for fallback, minority exemption, exact quotient ties, the district-total tie-break and unresolved precinct-level ties.

### 13.4 Original individual-profile regression fixtures (`historical` mode)

The following were calculated during specification preparation using the exact Pollster shares, section 6's geographic proxies, 0.01 regularization, column-then-row IPF and unchanged atomic votes after merging.

They are **outputs of this particular model**, not observed election results or forecasts. All other lists remain separate in each row.

| Configuration | L seats | R seats | C seats |
| --- | ---: | ---: | ---: |
| All active entities separate, ordinary 5% | 228 | 232 | 0 |
| NL + Razem, formal 8% | 244 | 216 | 0 |
| PSL + Polska 2050, formal 8% | 228 | 232 | 0 |
| PSL + Polska 2050, ordinary 5% | 225 | 229 | 6 |
| All active L entities together, formal 8% | 253 | 207 | 0 |
| All R entities together, formal 8% | 195 | 265 | 0 |

Under the original `historical` mode, individual seats are KO 195, NL 27, Razem 6, PiS 127, Konfederacja 57, KKP 35, Rozwój Plus 13, PSL 0 and Polska 2050 0.

The fit converged in nine iterations with maximum normalized margin error below 3.5e-13. These fixtures have no cutoff ambiguity.

Two required demonstration checks:

- NL + Razem have 33 seats separately and 59 jointly, a gain of 26. KO changes from 195 to 185. The L camp gains 16, not 26.
- PSL + Polska 2050 total 5.16%. Their 8% list is ineligible; their 5% list wins six seats. L + those centre seats = 231; R + those centre seats = 235. Display these as alternative alliances.

If implementation does not reproduce these values, investigate input mapping, calibration, thresholds and grouping. Do not tune proxy weights to force a preferred political outcome.

### 13.5 Browser acceptance scenarios

1. Fresh load shows the dated preset, source note, residual and inactive PPS.
2. A keyboard user merges NL and Razem and sees the legal badge and updated result.
3. A forbidden L–C–R list cannot be created.
4. Switching the centre merger from 8% to 5% updates eligibility and the majority alternatives.
5. Changing turnout updates headcounts while seats remain unchanged.
6. A support change clearly identifies its donors and preserves the exact total.
7. A sensitivity threshold event can be opened in the district inspector.
8. Every point selected from exhaustive comparison reproduces the same manual scenario.
9. The app loads and refreshes correctly under a repository subpath.
10. Exported and shared scenarios reproduce the same result in a clean browser session.

Use unit tests for mathematical correctness and a small Playwright suite for these critical journeys. Avoid low-value snapshots that merely duplicate implementation markup.

## 14 Implementation milestones for the AI agent

| Milestone | Work | Exit condition |
| --- | --- | --- |
| 1 Data and electoral core | Source importer, data validation, eligibility, d'Hondt, historical replay | Official 2023 national and district seats reproduced |
| 2 Scenario engine | Support conservation, proxies, IPF, turnout, grouping, alliance accounting | Synthetic and model-specific fixtures pass |
| 3 Interactive builder | Polish UI, list cards, support editing, district inspector, pinned comparisons | Core workflows usable by mouse and keyboard |
| 4 Exploration | Worker, canonical partitions, comparison plot, 1D sweep, 2D heatmap | Counts, sample limits and cancellation verified |
| 5 Delivery | JSON/CSV/URL state, methodology, accessibility pass, production build, Pages workflow | Reproducible deployable static application |

Build in this order. Do not spend the first milestone on decorative UI while the electoral engine remains unverified.

The implementing agent should resolve routine design choices using this specification. Ask only when a missing external dependency or genuine contradiction blocks implementation.

## 15 GitHub Pages deployment

GitHub Pages serves static HTML, CSS and JavaScript, which fits this application. [S7]

Use a production Vite build with the correct base path:

- repository project site: /REPOSITORY_NAME/;
- user/organisation root site or custom domain: /.

Configure the build for the actual destination. Use URL hash state so refreshing a shared scenario does not require server-side routing. Use base-aware asset references. Follow Vite's current static-deployment guidance. [S8]

Provide a GitHub Actions workflow that installs locked dependencies, type-checks, runs required tests, builds, uploads the static artifact and deploys through the GitHub Pages environment. Separate pull-request validation from deployment on the designated branch. Use the documented minimal permissions and current maintained action versions at implementation time.

The repo must contain:

- source and lockfile;
- normalized data and source manifest;
- deterministic importer;
- tests and fixtures;
- this PRD;
- README with local development, test, build and Pages setup commands;
- the deployment workflow;
- a concise methodology explanation available in the UI.

If the agent does not have a target repository or deployment access, complete the source, production build and workflow, and report the exact remaining repository/Pages setup step. Do not claim a site is deployed until its public URL has been checked.

## 16 Known limitations to communicate

Keep these in the methodology panel and scenario export:

- National polling does not identify district support. The geographic projection is a chosen 2023-based approximation.
- Several current entities share the same historical proxy because separately measured 2023 committee geography does not exist for them.
- The poll is a dated snapshot; reported interviewing mode and undecided treatment are unavailable for the default source.
- L/R/C membership and joint-list parliamentary alignment are scenario conventions.
- Merger support is fully retained. Candidate effects, campaign changes, strategic voting and merger aversion are excluded.
- Joint-list internal party seats cannot be inferred from the available inputs.
- Uniform turnout scaling cannot identify mobilisation advantages.
- The 2023 electorate and district mandates are fixed; demographic changes and future reapportionment are excluded.
- The residual is assumed not to elect representatives in the ten-slot preset.
- Sampled sensitivity charts can miss transitions inside a sampling interval.
- Exhaustive configuration coverage applies to the declared grouping rules and committee policy, not to every possible political or legal arrangement.

## Appendix A Official 2023 district baseline

The following control totals were extracted from the two official CSV files in section 4. “Location” is the district commission's official location, not a unique district name. B is the official final turnout numerator; V is valid votes for lists. [S2, S3]

| ID | Location | Seats | Eligible E | Ballots B | Valid votes V |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Legnica | 12 | 716,400 | 511,832 | 501,870 |
| 2 | Wałbrzych | 8 | 476,857 | 329,690 | 323,360 |
| 3 | Wrocław | 14 | 1,006,283 | 785,518 | 776,054 |
| 4 | Bydgoszcz | 12 | 745,557 | 544,560 | 533,919 |
| 5 | Toruń | 13 | 779,436 | 549,683 | 537,597 |
| 6 | Lublin | 15 | 903,524 | 659,345 | 648,347 |
| 7 | Chełm | 12 | 693,111 | 466,435 | 456,872 |
| 8 | Zielona Góra | 12 | 741,917 | 529,480 | 517,041 |
| 9 | Łódź | 10 | 581,567 | 460,736 | 456,552 |
| 10 | Piotrków Trybunalski | 9 | 540,069 | 405,246 | 396,819 |
| 11 | Sieradz | 12 | 731,875 | 544,995 | 533,128 |
| 12 | Kraków | 8 | 492,566 | 370,388 | 364,671 |
| 13 | Kraków | 14 | 957,821 | 766,634 | 757,522 |
| 14 | Nowy Sącz | 10 | 609,740 | 434,466 | 427,292 |
| 15 | Tarnów | 9 | 568,577 | 409,980 | 403,591 |
| 16 | Płock | 10 | 627,344 | 451,450 | 442,567 |
| 17 | Radom | 9 | 534,819 | 397,954 | 391,202 |
| 18 | Siedlce | 12 | 736,338 | 551,329 | 539,408 |
| 19 | Warszawa | 20 | 1,993,723 | 1,727,645 | 1,714,719 |
| 20 | Warszawa | 12 | 896,957 | 738,665 | 730,744 |
| 21 | Opole | 12 | 737,189 | 490,630 | 479,968 |
| 22 | Krosno | 11 | 662,734 | 450,116 | 441,996 |
| 23 | Rzeszów | 15 | 955,621 | 682,474 | 673,776 |
| 24 | Białystok | 14 | 881,094 | 619,422 | 609,244 |
| 25 | Gdańsk | 12 | 827,151 | 626,626 | 616,287 |
| 26 | Słupsk | 14 | 925,938 | 693,189 | 682,899 |
| 27 | Bielsko-Biała | 9 | 587,203 | 451,102 | 445,346 |
| 28 | Częstochowa | 7 | 444,929 | 330,305 | 323,941 |
| 29 | Katowice | 9 | 550,109 | 393,160 | 387,408 |
| 30 | Bielsko-Biała | 9 | 533,844 | 388,256 | 381,598 |
| 31 | Katowice | 12 | 702,884 | 532,883 | 526,167 |
| 32 | Katowice | 9 | 506,119 | 382,635 | 377,959 |
| 33 | Kielce | 16 | 946,053 | 672,589 | 659,132 |
| 34 | Elbląg | 8 | 455,241 | 307,931 | 299,380 |
| 35 | Olsztyn | 10 | 589,324 | 401,374 | 391,058 |
| 36 | Kalisz | 12 | 754,649 | 556,329 | 542,267 |
| 37 | Konin | 9 | 586,375 | 429,602 | 419,243 |
| 38 | Piła | 9 | 581,291 | 425,114 | 413,235 |
| 39 | Poznań | 10 | 723,283 | 602,166 | 596,038 |
| 40 | Koszalin | 8 | 475,274 | 330,222 | 322,149 |
| 41 | Szczecin | 12 | 771,809 | 564,735 | 554,308 |
| **Total** | | **460** | **29,532,595** | **21,966,891** | **21,596,674** |

## Appendix B Source register

All web sources below were checked on 23 October 2026. Legal and polling inputs should retain their own version dates.

- **[S1] Electoral Code**, official consolidated text dated 8 October 2026, based on Dz.U. 2026 poz. 1261. Articles 14–15, 193, 196–198, 232–233 and Annex 1. https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20110210112/U/D20110112Lj.pdf
- **[S2] KBW official 2023 downloadable data archive.** https://danewyborcze.kbw.gov.pl/indexc6e4.html?title=Parlament_2023
- **[S3] PKW official result notice**, 17 October 2023, Dz.U. 2023 poz. 2234; national totals on the opening pages and detailed district results afterward. https://eli.gov.pl/eli/DU/2023/2234/ogl ; direct PDF: https://eli.gov.pl/api/acts/DU/2023/2234/text/O/D20232234.pdf
- **[S4] Pollster survey public report**, fieldwork 19–21 October 2026, published 22 October 2026. https://zero.pl/news/nowy-sondaz-partyjny-ko-prowadzi-psl-i-polska-2050-pod-progiem
- **[S5] Corroborating Pollster report**, explicit publication date, shares and sample. https://wiadomosci.onet.pl/kraj/ko-prowadzi-w-sondazu-wyborczym-duza-przewaga-nad-pis/txqdtnb
- **[S6] Polska Partia Socjalistyczna official website**, used to verify the named organisation, not to estimate its support. https://ppspl.eu/
- **[S7] GitHub Pages documentation.** https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- **[S8] Vite static-deployment documentation.** https://vite.dev/guide/static-deploy.html

The geographic mapping, numerical regularizer, support transfer rules, permitted family combinations, perfect-retention assumption, UI choices and calculated regression fixtures are design choices or calculations specified in this document, not claims sourced from polling organisations or PKW.

