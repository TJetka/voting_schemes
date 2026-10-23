"""Offline acceptance checks for official data import and its independent fixtures."""

import gzip
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.import_pkw import (
    COMMITTEE_IDS,
    build_historical,
    build_manifest,
    index_rows,
    json_bytes,
    parse_csv,
    parse_notice_seats,
    read_archive,
    write_new_or_verify,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"


@pytest.fixture(scope="module")
def historical():
    return build_historical(RAW)


def test_all_appendix_control_totals_and_invariants(historical):
    expected = json.loads(
        (Path(__file__).parent / "district_control_totals.json").read_text()
    )
    assert len(historical["districts"]) == 41
    assert {d["id"] for d in historical["districts"]} == set(range(1, 42))
    for district, control in zip(historical["districts"], expected, strict=True):
        assert {key: district[key] for key in control} == control
        assert sum(district["votesByCommittee"].values()) == district["validVotes2023"]
        assert (
            district["validVotes2023"] + district["invalidVotes2023"]
            == district["ballots2023"]
        )
        assert isinstance(district["seats"], int)
        assert len(district["boundaryDescription"]) > 10
        assert (
            set(district["onBallot"])
            == set(district["votesByCommittee"])
            == set(COMMITTEE_IDS.values())
        )
    assert historical["totals"] == {
        "seats": 460,
        "eligible2023": 29_532_595,
        "ballots2023": 21_966_891,
        "validVotes2023": 21_596_674,
        "invalidVotes2023": 370_217,
    }


def test_final_electorate_overseas_assignment_and_literal_turnout_ceiling(historical):
    districts = historical["districts"]
    assert (
        districts[0]["eligible2023"] == 716_400
    )  # Metadata's earlier snapshot is 705,355.
    assert districts[18]["validVotes2023"] == 1_714_719
    baseline = (
        historical["totals"]["ballots2023"] / historical["totals"]["eligible2023"]
    )
    assert round(100 * baseline, 2) == 74.38
    limiting = min(districts, key=lambda d: d["eligible2023"] / d["ballots2023"])
    assert limiting["id"] == 19
    assert 100 * baseline * limiting["eligible2023"] / limiting[
        "ballots2023"
    ] == pytest.approx(85.8375467)


def test_absent_committees_and_historical_legal_treatment(historical):
    committees = {c["id"]: c for c in historical["committees"]}
    assert {
        c["id"] for c in committees.values() if c["committeeType"] == "coalition"
    } == {"ko", "td"}
    assert {c["id"] for c in committees.values() if c["minorityExempt"]} == {"mn"}
    for district in historical["districts"]:
        assert district["onBallot"]["mn"] == (district["id"] == 21)
        if district["id"] != 21:
            assert district["votesByCommittee"]["mn"] == 0


def test_independent_notice_seats(historical):
    official = historical["officialSeats"]
    assert {key: value for key, value in official["national"].items() if value} == {
        "td": 65,
        "nl": 26,
        "pis": 194,
        "konf": 18,
        "ko": 157,
    }
    assert official["districts"]["19"]["ko"] == 9
    assert official["districts"]["19"]["pis"] == 4
    assert official["districts"]["21"]["mn"] == 0
    for district in historical["districts"]:
        assert (
            sum(official["districts"][str(district["id"])].values())
            == district["seats"]
        )
    for committee_id in COMMITTEE_IDS.values():
        assert (
            sum(row[committee_id] for row in official["districts"].values())
            == official["national"][committee_id]
        )


def test_bom_semicolon_and_duplicate_district_rejection():
    assert parse_csv(b"\xef\xbb\xbfid;label\n1;Legnica\n") == [
        {"id": "1", "label": "Legnica"}
    ]
    with pytest.raises(ValueError, match="Duplicate district ID 1"):
        index_rows([{"id": "1"}, {"id": "1"}], "id")
    with pytest.raises(ValueError, match="exactly districts 1 through 41"):
        index_rows([{"id": "1"}], "id")


def test_altered_source_hash_is_rejected(tmp_path):
    archive_name = "okregi_sejm_csv.zip"
    (tmp_path / archive_name).write_bytes(b"changed upstream data")
    with pytest.raises(ValueError, match="Source checksum differs"):
        read_archive(tmp_path, archive_name, "okregi_sejm_utf8.csv")


def test_missing_notice_chapter_fails_actionably():
    raw = gzip.decompress((RAW / "D20232234.pdftotext.txt.gz").read_bytes()).decode()
    damaged = raw.replace("Okręg wyborczy nr 41", "missing chapter")
    with pytest.raises(ValueError, match="41 district chapters"):
        parse_notice_seats(damaged)


def test_rebuild_is_byte_identical_to_bundled_data(historical):
    normalized = json_bytes(historical)
    assert normalized == (ROOT / "src/data/historical.json").read_bytes()
    assert (
        json_bytes(build_manifest(RAW, normalized))
        == (ROOT / "src/data/source-manifest.json").read_bytes()
    )


def test_generated_data_is_never_silently_overwritten(tmp_path):
    path = tmp_path / "output.json"
    write_new_or_verify(path, b"first")
    write_new_or_verify(path, b"first")
    with pytest.raises(ValueError, match="Refusing to overwrite differing data"):
        write_new_or_verify(path, b"second")
    assert path.read_bytes() == b"first"


def test_cli_end_to_end_smoke(tmp_path, historical):
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/import_pkw.py"),
            "--raw-dir",
            str(RAW),
            "--output-dir",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "41 districts / 460 seats" in result.stderr
    assert json.loads((tmp_path / "historical.json").read_text()) == historical
    manifest = json.loads((tmp_path / "source-manifest.json").read_text())
    assert manifest["parserVersion"] == "1.0.0"
    assert len(manifest["sources"]) == 3
