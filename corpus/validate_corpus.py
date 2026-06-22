"""
Roamio corpus validator
========================
Checks every destination in corpus.json against the rules in SCHEMA.md, so
mechanical mistakes are caught automatically as you scale from 2 -> 15 destinations.

Run it:   ./venv/Scripts/python.exe corpus/validate_corpus.py

Exit code 0 = all good. Exit code 1 = problems found (so it can gate a commit later).

This is a "smart not hard" safeguard: you'll never again ship a destination where
min_hours > max_hours, a month is 13, or a required field is silently missing.
"""

import json
import sys
from pathlib import Path

CORPUS_PATH = Path(__file__).parent / "corpus.json"

# Top-level fields every destination must have (see SCHEMA.md).
REQUIRED_FIELDS = [
    "id", "name", "region", "description", "tags", "recommended_trip_days",
    "drive_times", "open_months", "best_season", "cost_ranges",
    "permits", "stays", "activities", "tips",
]

# Cost fields that must be [low, high] PKR ranges.
COST_RANGE_FIELDS = ["hotel_pkr_per_night", "food_pkr_per_day", "local_transport_pkr_per_day"]


def validate_destination(dest, index):
    """Return a list of human-readable error strings for one destination."""
    errors = []
    # Use id (or index) so the message tells you WHICH destination is broken.
    who = dest.get("id") or dest.get("name") or f"#{index}"

    # 1) Required fields present and non-empty.
    for field in REQUIRED_FIELDS:
        if field not in dest:
            errors.append(f"[{who}] missing required field: '{field}'")
        elif dest[field] in (None, "", [], {}):
            errors.append(f"[{who}] field '{field}' is empty")

    # 2) id should be a URL-safe slug (lowercase, hyphens, no spaces).
    dest_id = dest.get("id", "")
    if dest_id and (dest_id != dest_id.lower() or " " in dest_id):
        errors.append(f"[{who}] id '{dest_id}' is not a clean slug (use lowercase-with-hyphens)")

    # 3) tags must be a non-empty list of strings.
    tags = dest.get("tags")
    if isinstance(tags, list):
        if not all(isinstance(t, str) for t in tags):
            errors.append(f"[{who}] tags must all be strings")
    elif tags is not None:
        errors.append(f"[{who}] tags must be a list")

    # 4) recommended_trip_days: min and ideal ints, min <= ideal.
    rtd = dest.get("recommended_trip_days", {})
    if isinstance(rtd, dict):
        mn, ideal = rtd.get("min"), rtd.get("ideal")
        if not isinstance(mn, int) or not isinstance(ideal, int):
            errors.append(f"[{who}] recommended_trip_days needs integer 'min' and 'ideal'")
        elif mn > ideal:
            errors.append(f"[{who}] recommended_trip_days.min ({mn}) > ideal ({ideal})")

    # 5) drive_times: any entry that is a dict must have min_hours <= max_hours, both > 0.
    for origin, val in dest.get("drive_times", {}).items():
        if isinstance(val, dict):
            lo, hi = val.get("min_hours"), val.get("max_hours")
            if not isinstance(lo, (int, float)) or not isinstance(hi, (int, float)):
                errors.append(f"[{who}] drive_times.{origin} needs numeric min_hours/max_hours")
            else:
                if lo <= 0 or hi <= 0:
                    errors.append(f"[{who}] drive_times.{origin} hours must be > 0")
                if lo > hi:
                    errors.append(f"[{who}] drive_times.{origin} min_hours ({lo}) > max_hours ({hi})")

    # 6) open_months: list of ints in 1..12, no duplicates.
    months = dest.get("open_months")
    if isinstance(months, list):
        bad = [m for m in months if not isinstance(m, int) or not (1 <= m <= 12)]
        if bad:
            errors.append(f"[{who}] open_months has out-of-range values: {bad} (must be 1-12)")
        if len(months) != len(set(months)):
            errors.append(f"[{who}] open_months has duplicate months")
    elif months is not None:
        errors.append(f"[{who}] open_months must be a list of ints")

    # 7) cost_ranges: each range field must be [low, high] with low <= high, both > 0.
    costs = dest.get("cost_ranges", {})
    for field in COST_RANGE_FIELDS:
        if field not in costs:
            errors.append(f"[{who}] cost_ranges missing '{field}'")
            continue
        rng = costs[field]
        if not (isinstance(rng, list) and len(rng) == 2):
            errors.append(f"[{who}] cost_ranges.{field} must be [low, high]")
            continue
        lo, hi = rng
        if not all(isinstance(x, (int, float)) for x in rng):
            errors.append(f"[{who}] cost_ranges.{field} must be numbers")
        elif lo <= 0 or hi <= 0:
            errors.append(f"[{who}] cost_ranges.{field} must be > 0")
        elif lo > hi:
            errors.append(f"[{who}] cost_ranges.{field} low ({lo}) > high ({hi})")

    return errors


def main():
    # Load + parse. A JSON syntax error is itself a validation failure.
    try:
        data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR: {CORPUS_PATH} not found")
        return 1
    except json.JSONDecodeError as e:
        print(f"ERROR: corpus.json is not valid JSON -> {e}")
        return 1

    if not isinstance(data, list):
        print("ERROR: corpus.json must be a list of destinations")
        return 1

    all_errors = []
    seen_ids = {}
    for i, dest in enumerate(data):
        all_errors.extend(validate_destination(dest, i))
        # Cross-destination check: ids must be unique.
        dest_id = dest.get("id")
        if dest_id in seen_ids:
            all_errors.append(f"[{dest_id}] duplicate id (also used at index {seen_ids[dest_id]})")
        elif dest_id:
            seen_ids[dest_id] = i

    print(f"Validating {len(data)} destination(s) in corpus.json\n")
    if all_errors:
        print(f"FAILED — {len(all_errors)} problem(s) found:\n")
        for err in all_errors:
            print("  x", err)
        return 1

    print("PASSED — all destinations conform to SCHEMA.md")
    for dest in data:
        print(f"  ok  {dest['id']:<16} ({len(dest['activities'])} activities, open months {dest['open_months']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
