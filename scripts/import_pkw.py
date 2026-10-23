"""Rebuild the 2023 Sejm baseline from checked-in official source snapshots.

Only the Python standard library is required. Inputs are historical public
aggregate election data. The result-notice control seats are parsed from the
official notice independently of any d'Hondt implementation.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import logging
import re
from pathlib import Path
from typing import Literal, TypedDict
from zipfile import ZipFile

LOGGER = logging.getLogger(__name__)
PARSER_VERSION = "1.0.0"
DATA_VERSION = "pkw-2023-v1"
ELECTION_DATE = "2023-10-15"
RETRIEVAL_DATE = "2026-10-23"
ARCHIVE_BASE = "https://danewyborcze.kbw.gov.pl/dane/2023/sejmsenat/"


class Committee(TypedDict):
    id: str
    label: str
    committeeType: Literal["ordinary", "coalition"]
    minorityExempt: bool


class District(TypedDict):
    id: int
    commissionSeat: str
    boundaryDescription: str
    seats: int
    eligible2023: int
    ballots2023: int
    validVotes2023: int
    invalidVotes2023: int
    votesByCommittee: dict[str, int]
    onBallot: dict[str, bool]


class OfficialSeats(TypedDict):
    national: dict[str, int]
    districts: dict[str, dict[str, int]]


class HistoricalData(TypedDict):
    schemaVersion: int
    dataVersion: str
    electionDate: str
    totals: dict[str, int]
    committees: list[Committee]
    districts: list[District]
    officialSeats: OfficialSeats


# Explicit, versioned source mapping: names alone do not imply legal thresholds.
COMMITTEE_IDS = {
    "KOMITET WYBORCZY BEZPARTYJNI SAMORZĄDOWCY": "bs",
    "KOALICYJNY KOMITET WYBORCZY TRZECIA DROGA POLSKA 2050 SZYMONA HOŁOWNI - POLSKIE STRONNICTWO LUDOWE": "td",
    "KOMITET WYBORCZY NOWA LEWICA": "nl",
    "KOMITET WYBORCZY PRAWO I SPRAWIEDLIWOŚĆ": "pis",
    "KOMITET WYBORCZY KONFEDERACJA WOLNOŚĆ I NIEPODLEGŁOŚĆ": "konf",
    "KOALICYJNY KOMITET WYBORCZY KOALICJA OBYWATELSKA PO .N IPL ZIELONI": "ko",
    "KOMITET WYBORCZY POLSKA JEST JEDNA": "pjj",
    "KOMITET WYBORCZY WYBORCÓW RUCHU DOBROBYTU I POKOJU": "rdip",
    "KOMITET WYBORCZY NORMALNY KRAJ": "nk",
    "KOMITET WYBORCZY ANTYPARTIA": "anty",
    "KOMITET WYBORCZY RUCH NAPRAWY POLSKI": "rnp",
    "KOMITET WYBORCZY WYBORCÓW MNIEJSZOŚĆ NIEMIECKA": "mn",
}
LIST_NUMBER_IDS = {"2": "td", "3": "nl", "4": "pis", "5": "konf", "6": "ko", "11": "mn"}
SOURCE_HASHES = {
    "okregi_sejm_csv.zip": "275b0617e81bf1643f0139d279873cbec8d8fb6c14b6fd3657345dd3d26e5a1c",
    "wyniki_gl_na_listy_po_okregach_sejm_csv.zip": "7565b8fa5102f64c0435e994ad11369672a1948987ed639b12ad82da72005b03",
    "okregi_sejm_utf8.csv": "23db1510fb408edd5600b640faa54ab30daae373ad146d254ba25852218f0858",
    "wyniki_gl_na_listy_po_okregach_sejm_utf8.csv": "fe994644d3c1fc5f3f3c19edb1dc4df55d648b86693763fbaf68811d70c4a599",
}
EXPECTED_TOTALS = {
    "seats": 460,
    "eligible2023": 29_532_595,
    "ballots2023": 21_966_891,
    "validVotes2023": 21_596_674,
    "invalidVotes2023": 370_217,
}
RESULT_FIELDS = {
    "eligible2023": "Liczba wyborców uprawnionych do głosowania",
    "ballots2023": "Liczba kart ważnych",
    "invalidVotes2023": "Liczba głosów nieważnych",
    "validVotes2023": "Liczba głosów ważnych oddanych łącznie na wszystkie listy kandydatów",
}


def sha256(data: bytes) -> str:
    """Return a hexadecimal SHA-256 digest of the exact source bytes."""
    return hashlib.sha256(data).hexdigest()


def parse_csv(data: bytes) -> list[dict[str, str]]:
    """Read semicolon-separated UTF-8 records, tolerating a UTF-8 BOM."""
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig")), delimiter=";"))


def read_archive(
    raw_dir: Path, archive_name: str, member_name: str
) -> list[dict[str, str]]:
    """Verify both archived and extracted bytes before parsing a known CSV."""
    archive = (raw_dir / archive_name).read_bytes()
    if sha256(archive) != SOURCE_HASHES[archive_name]:
        raise ValueError(
            f"Source checksum differs: {archive_name}; inspect the new source before updating it"
        )
    with ZipFile(io.BytesIO(archive)) as zipped:
        if zipped.namelist() != [member_name]:
            raise ValueError(f"Unexpected archive members in {archive_name}")
        extracted = zipped.read(member_name)
    if sha256(extracted) != SOURCE_HASHES[member_name]:
        raise ValueError(f"Extracted source checksum differs: {member_name}")
    return parse_csv(extracted)


def index_rows(rows: list[dict[str, str]], key: str) -> dict[int, dict[str, str]]:
    """Index by official district ID and reject duplicates or omitted districts."""
    indexed: dict[int, dict[str, str]] = {}
    for row in rows:
        district_id = int(row[key])
        if district_id in indexed:
            raise ValueError(f"Duplicate district ID {district_id}")
        indexed[district_id] = row
    if set(indexed) != set(range(1, 42)):
        raise ValueError("Source must contain exactly districts 1 through 41")
    return indexed


def parse_notice_seats(text: str) -> OfficialSeats:
    """Extract published seat statements, never compute seats from vote totals.

    The source is Poppler's layout-preserving extraction of Dz.U. 2023 poz.
    2234. Headers and line-wrap hyphenation are removed before matching each
    district's explicit 'liście ... przypadło ... mandatów' statements.
    """
    text = re.sub(r"\fDziennik Ustaw[^\n]*\n", "\n", text)
    text = re.sub(r"-\s*\n\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    sections = re.split(r"Okręg wyborczy nr\s+(\d+)", text)
    if len(sections) != 83:
        raise ValueError("Official result notice must contain 41 district chapters")
    ids = list(COMMITTEE_IDS.values())
    districts: dict[str, dict[str, int]] = {}
    for offset in range(1, len(sections), 2):
        district_id, chapter = sections[offset : offset + 2]
        seats = dict.fromkeys(ids, 0)
        matches = re.findall(
            r"liście nr (\d+) zgłoszonej przez (.+?), na którą oddano .+?przypadł[oy]? (\d+) mandat",
            chapter,
        )
        if not matches:
            raise ValueError(f"No published seat statements for district {district_id}")
        seen: set[str] = set()
        for list_number, _label, count in matches:
            committee_id = LIST_NUMBER_IDS[list_number]
            if committee_id in seen:
                raise ValueError(
                    f"Duplicate published seat statement: {district_id}/{committee_id}"
                )
            seen.add(committee_id)
            seats[committee_id] = int(count)
        districts[district_id] = seats
    national_text = sections[0].split("liczbę mandatów:", 1)[1]
    national = dict.fromkeys(ids, 0)
    national_matches = re.findall(
        r"list[ya] nr (\d+) zgłoszon[ea] przez .+?uzyskał[ya] (\d+) mandat",
        national_text,
    )
    if len(national_matches) != 6:
        raise ValueError(
            "Could not parse the six national seat results in the official notice"
        )
    for list_number, count in national_matches:
        national[LIST_NUMBER_IDS[list_number]] = int(count)
    sums = {
        committee_id: sum(row[committee_id] for row in districts.values())
        for committee_id in ids
    }
    if sums != national or sum(national.values()) != 460:
        raise ValueError(
            "Independent national and district seat statements do not agree"
        )
    return {"national": national, "districts": districts}


def build_historical(raw_dir: Path) -> HistoricalData:
    """Import all official districts, validate control totals and attach control seats."""
    metadata = index_rows(
        read_archive(raw_dir, "okregi_sejm_csv.zip", "okregi_sejm_utf8.csv"),
        "Numer okręgu",
    )
    results = index_rows(
        read_archive(
            raw_dir,
            "wyniki_gl_na_listy_po_okregach_sejm_csv.zip",
            "wyniki_gl_na_listy_po_okregach_sejm_utf8.csv",
        ),
        "Nr okręgu",
    )
    committees: list[Committee] = [
        {
            "id": committee_id,
            "label": label,
            "committeeType": "coalition"
            if committee_id in {"ko", "td"}
            else "ordinary",
            "minorityExempt": committee_id == "mn",
        }
        for label, committee_id in COMMITTEE_IDS.items()
    ]
    districts: list[District] = []
    for district_id in sorted(metadata):
        meta, row = metadata[district_id], results[district_id]
        source_committees = {key for key in row if "KOMITET WYBORCZY" in key}
        if source_committees != set(COMMITTEE_IDS):
            raise ValueError("Committee columns differ from the versioned 2023 schema")
        votes = {
            committee_id: int(row[label]) if row[label] else 0
            for label, committee_id in COMMITTEE_IDS.items()
        }
        district: District = {
            "id": district_id,
            "commissionSeat": meta["Siedziba OKW"],
            "boundaryDescription": meta["Opis granic"],
            "seats": int(meta["Liczba mandatów"]),
            "eligible2023": int(row[RESULT_FIELDS["eligible2023"]]),
            "ballots2023": int(row[RESULT_FIELDS["ballots2023"]]),
            "validVotes2023": int(row[RESULT_FIELDS["validVotes2023"]]),
            "invalidVotes2023": int(row[RESULT_FIELDS["invalidVotes2023"]]),
            "votesByCommittee": votes,
            "onBallot": {
                committee_id: row[label] != ""
                for label, committee_id in COMMITTEE_IDS.items()
            },
        }
        if any(value < 0 for value in votes.values()):
            raise ValueError(f"Negative committee votes in district {district_id}")
        if sum(votes.values()) != district["validVotes2023"]:
            raise ValueError(
                f"Committee votes do not sum to valid votes in district {district_id}"
            )
        if (
            district["validVotes2023"] + district["invalidVotes2023"]
            != district["ballots2023"]
        ):
            raise ValueError(
                f"Valid plus invalid votes do not sum to ballot papers in district {district_id}"
            )
        districts.append(district)
    totals = {
        "seats": sum(d["seats"] for d in districts),
        "eligible2023": sum(d["eligible2023"] for d in districts),
        "ballots2023": sum(d["ballots2023"] for d in districts),
        "validVotes2023": sum(d["validVotes2023"] for d in districts),
        "invalidVotes2023": sum(d["invalidVotes2023"] for d in districts),
    }
    if totals != EXPECTED_TOTALS:
        raise ValueError(f"Official national control totals differ: {totals}")
    notice_metadata = json.loads(
        (raw_dir / "result-notice-source.json").read_text(encoding="utf-8")
    )
    compressed_notice = (raw_dir / "D20232234.pdftotext.txt.gz").read_bytes()
    if sha256(compressed_notice) != notice_metadata["localSha256"]:
        raise ValueError("Result-notice compressed extraction checksum differs")
    notice_text = gzip.decompress(compressed_notice)
    if sha256(notice_text) != notice_metadata["extractedTextSha256"]:
        raise ValueError("Result-notice extracted text checksum differs")
    official_seats = parse_notice_seats(notice_text.decode("utf-8"))
    for district in districts:
        if (
            sum(official_seats["districts"][str(district["id"])].values())
            != district["seats"]
        ):
            raise ValueError(
                f"Published seat allocation disagrees with mandates: district {district['id']}"
            )
    return {
        "schemaVersion": 1,
        "dataVersion": DATA_VERSION,
        "electionDate": ELECTION_DATE,
        "totals": totals,
        "committees": committees,
        "districts": districts,
        "officialSeats": official_seats,
    }


def build_manifest(raw_dir: Path, normalized: bytes) -> dict[str, object]:
    """Record immutable source hashes, parser version and normalized artifact hash."""
    sources: list[dict[str, object]] = []
    for filename in (
        "okregi_sejm_csv.zip",
        "wyniki_gl_na_listy_po_okregach_sejm_csv.zip",
    ):
        member_name = filename.replace("_csv.zip", "_utf8.csv")
        sources.append(
            {
                "sourceUrl": ARCHIVE_BASE + filename,
                "localPath": "data/raw/" + filename,
                "retrievalDate": RETRIEVAL_DATE,
                "sha256": SOURCE_HASHES[filename],
                "extractedFilename": member_name,
                "extractedSha256": SOURCE_HASHES[member_name],
            }
        )
    sources.append(
        json.loads((raw_dir / "result-notice-source.json").read_text(encoding="utf-8"))
    )
    return {
        "schemaVersion": 1,
        "dataVersion": DATA_VERSION,
        "parserVersion": PARSER_VERSION,
        "electionDate": ELECTION_DATE,
        "retrievalDate": RETRIEVAL_DATE,
        "sources": sources,
        "normalizedSha256": sha256(normalized),
        "configuration": {
            "joinKey": "official district number",
            "districtIds": list(range(1, 42)),
            "blankCommitteeCells": "zero votes, onBallot false",
        },
        "seed": None,
        "gitSha": None,
        "gitShaNote": "Initial source import preceded repository initialization. Reproduce source revision from the version-control commit containing this manifest.",
        "notes": [
            "Final electorate comes from results, not the metadata snapshot.",
            "Overseas and ship votes are already included in district 19.",
            "Control seats are independently extracted from the published result notice, not computed from votes.",
        ],
    }


def json_bytes(value: object) -> bytes:
    """Serialize reproducibly with UTF-8, stable field order and a final newline."""
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_new_or_verify(path: Path, content: bytes) -> None:
    """Write a new artifact or verify an identical one; never overwrite changed data."""
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError(
                f"Refusing to overwrite differing data: {path}; use a new --output-dir and review the diff"
            )
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def main() -> None:
    """Run an offline, reproducible import from configurable source/output directories."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--output-dir", type=Path, default=Path("src/data"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    historical = build_historical(args.raw_dir)
    normalized = json_bytes(historical)
    manifest = json_bytes(build_manifest(args.raw_dir, normalized))
    write_new_or_verify(args.output_dir / "historical.json", normalized)
    write_new_or_verify(args.output_dir / "source-manifest.json", manifest)
    LOGGER.info(
        "Verified %s, parser %s, 41 districts / 460 seats; normalized SHA-256 %s",
        DATA_VERSION,
        PARSER_VERSION,
        sha256(normalized),
    )


if __name__ == "__main__":
    main()
