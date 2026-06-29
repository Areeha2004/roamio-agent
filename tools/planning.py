"""
Roamio planning tools — build_route() · estimate_cost() · check_feasibility()
=============================================================================
The deterministic 'logic core' the agent calls. Plain Python, no LLM — just math
over the corpus numbers. The agent chains them:

    route = build_route(stop_ids, start_city)
    cost  = estimate_cost(route, group_type, days)
    feas  = check_feasibility(route, cost, budget, days, month)

check_feasibility is the important one: its verdict + suggestions are what trigger
the agent's RE-PLAN loop (drop a stop, add days, change month) in Weeks 3-4.

Run the demo:  ./venv/Scripts/python.exe tools/planning.py

ROUTING NOTE: drive time = (start_city -> Islamabad hub) + (hub -> destination),
using origin_hubs.json. Accurate for southern origins; northern origins are flagged
as upper bounds (see DECISIONS #006). Generalizing this is parked in BACKLOG.md.
"""

import json
import math
from pathlib import Path

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "corpus.json"
HUBS_PATH = Path(__file__).parent.parent / "corpus" / "origin_hubs.json"

_corpus = {d["id"]: d for d in json.loads(CORPUS_PATH.read_text(encoding="utf-8"))}
_origins = json.loads(HUBS_PATH.read_text(encoding="utf-8"))["origins"]

MONTHS = ["", "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]

# --- tunable model parameters (confirmed with the product owner) -------------
GROUP_SIZES = {            # group_type -> (people, hotel_rooms)
    "solo": (1, 1),
    "couple": (2, 1),
    "friends": (4, 2),
    "family": (4, 2),
}
DRIVE_RATE_PKR_PER_HOUR = (1200, 2500)        # private car/jeep, per group, per drive-hour
BUS_FARE_PKR_PER_HOUR_PER_PERSON = 350        # local/public transport, per person, per drive-hour
LOCAL_SLOWER_FACTOR = 1.2                     # buses + transfers run slower than a private car
MAX_DRIVE_HOURS_PER_DAY = 8
# Where each accommodation tier sits within a destination's cost range.
STYLE_POS = {"budget": 0.0, "standard": 0.5, "luxury": 1.0}


# =========================================================================
# TOOL 1 — build_route
# =========================================================================
def _hours_from_islamabad(dest):
    return dest["drive_times"]["from_islamabad"]["max_hours"]


def _origin_leg(start_city):
    """Returns (hours_to_hub, note, side) or None if the city isn't in the table."""
    key = start_city.strip().lower().replace(" ", "_")  # "Rahim Yar Khan" -> "rahim_yar_khan"
    if key in _origins:
        o = _origins[key]
        return o["hours_to_hub"], o["note"], o.get("side", "south")
    return None


def build_route(stop_ids, start_city="Islamabad"):
    """Order destinations and estimate round-trip driving time from the start city."""
    leg = _origin_leg(start_city)
    if leg is None:
        return {"error": f"start city '{start_city}' not in origin_hubs.json yet",
                "supported_origins": sorted(_origins.keys())}
    origin_hours, origin_note, side = leg

    warnings = []
    if side == "north":
        warnings.append(
            f"'{start_city}' is already in the northern corridor — drive times are "
            "measured via Islamabad and are an UPPER BOUND (likely over-estimated)."
        )

    known, unknown = [], []
    for sid in stop_ids:
        (known if sid in _corpus else unknown).append(sid)

    ordered = sorted(known, key=lambda sid: _hours_from_islamabad(_corpus[sid]))
    farthest = max((_hours_from_islamabad(_corpus[sid]) for sid in ordered), default=0)
    est_round_trip = round(2 * (origin_hours + farthest), 1)

    # Human-readable route legs with the "via" road description (for the UI/writer).
    legs = []
    if origin_hours > 0:
        legs.append({"from": start_city, "to": "Islamabad", "hours": origin_hours, "via": origin_note})
    for sid in ordered:
        d = _corpus[sid]
        legs.append({
            "from": "Islamabad", "to": d["name"],
            "hours": _hours_from_islamabad(d),
            "via": d["drive_times"]["from_islamabad"].get("note", ""),
        })

    return {
        "start_city": start_city,
        "ordered_stops": [
            {"id": sid, "name": _corpus[sid]["name"],
             "hours_from_start": round(origin_hours + _hours_from_islamabad(_corpus[sid]), 1)}
            for sid in ordered
        ],
        "legs": legs,
        "est_round_trip_drive_hours": est_round_trip,
        "unknown_ids": unknown,
        "warnings": warnings,
    }


# =========================================================================
# TOOL 2 — estimate_cost
# =========================================================================
def _avg_range(stops, field):
    """Average [low, high] of a cost field across the visited stops."""
    lows = [s["cost_ranges"][field][0] for s in stops]
    highs = [s["cost_ranges"][field][1] for s in stops]
    return sum(lows) / len(lows), sum(highs) / len(highs)


def _at(rng, pos):
    """Value at position `pos` (0..1) within a (low, high) range."""
    lo, hi = rng
    return lo + pos * (hi - lo)


def estimate_cost(route, group_type, days, style="standard", transport="car"):
    """Estimate trip cost at a stay tier (budget/standard/luxury) and a transport mode.

    Stay tier sets where hotels/food land in each destination's range. Transport mode:
    'car' = private car/jeep (per group, faster); 'local' = public/bus (per person, a bit
    slower, usually cheaper). Returns single PKR numbers, a per-component breakdown, and
    BOTH transport options so the UI can show car vs local side by side."""
    if "error" in route:
        return {"error": "cannot cost an invalid route", "route_error": route["error"]}

    stops = [_corpus[s["id"]] for s in route["ordered_stops"]]
    if not stops:
        return {"error": "no stops to cost"}

    people, rooms = GROUP_SIZES.get(group_type, (2, 1))
    nights = max(days - 1, 1)        # final day is the return leg
    pos = STYLE_POS.get(style, 0.5)
    round_trip = route["est_round_trip_drive_hours"]
    one_way = round_trip / 2

    hotel_per_night = _at(_avg_range(stops, "hotel_pkr_per_night"), pos)   # scales with tier
    food_per_day = _at(_avg_range(stops, "food_pkr_per_day"), pos)         # scales with tier
    local_lo, local_hi = _avg_range(stops, "local_transport_pkr_per_day")
    local_per_day = (local_lo + local_hi) / 2                              # tier-independent

    hotels = rooms * nights * hotel_per_night
    food = people * days * food_per_day
    local = days * local_per_day

    # Two intercity-transport options (the long-haul to/from the north).
    car_cost = round_trip * (sum(DRIVE_RATE_PKR_PER_HOUR) / 2)             # private car, per group
    bus_cost = round_trip * BUS_FARE_PKR_PER_HOUR_PER_PERSON * people      # public/bus, per person
    transport_options = {
        "car": {"label": "Private car", "cost": int(round(car_cost)),
                "one_way_hours": round(one_way, 1), "round_trip_hours": round(round_trip, 1)},
        "local": {"label": "Local / public", "cost": int(round(bus_cost)),
                  "one_way_hours": round(one_way * LOCAL_SLOWER_FACTOR, 1),
                  "round_trip_hours": round(round_trip * LOCAL_SLOWER_FACTOR, 1)},
    }
    mode = transport if transport in transport_options else "car"
    intercity = transport_options[mode]["cost"]
    total = hotels + food + local + intercity

    return {
        "style": style, "transport": mode, "group_type": group_type,
        "people": people, "rooms": rooms, "days": days, "nights": nights,
        "hotel_per_night_pkr": int(round(hotel_per_night)),
        "one_way_drive_hours": transport_options[mode]["one_way_hours"],
        "transport_options": transport_options,
        "breakdown_pkr": {
            "hotels": int(round(hotels)),
            "food": int(round(food)),
            "local_transport": int(round(local)),
            "intercity_transport": intercity,
        },
        "total_pkr": int(round(total)),
    }


# =========================================================================
# TOOL 3 — check_feasibility  (the re-plan trigger)
# =========================================================================
def check_feasibility(route, cost, budget, days, month):
    """Validate a plan against season, time, and budget. Returns a verdict plus
    concrete suggestions the agent can use to re-plan."""
    if "error" in route or "error" in cost:
        return {"error": "cannot check an invalid route/cost"}

    stops = [_corpus[s["id"]] for s in route["ordered_stops"]]
    month_name = MONTHS[month] if 1 <= month <= 12 else str(month)
    problems, suggestions = [], []

    # 1) SEASON — is each stop open in the travel month?
    out_of_season = [s for s in stops if month not in s["open_months"]]
    if out_of_season:
        for s in out_of_season:
            open_names = ", ".join(MONTHS[m] for m in s["open_months"])
            problems.append(f"{s['name']} is closed in {month_name} (open: {open_names}).")
            suggestions.append(f"Drop {s['name']}, or travel when it's open ({open_names}).")

    # 2) TIME — driving + time at stops, but the arrival and departure days double
    #    as time at the destination (you explore the evening you arrive / morning you
    #    leave), so they overlap the stay instead of stacking on top. Without this, a
    #    normal 3-day Naran trip is wrongly scored as needing 5 days.
    drive_days = math.ceil(route["est_round_trip_drive_hours"] / MAX_DRIVE_HOURS_PER_DAY)
    stop_days = sum(s["recommended_trip_days"]["min"] for s in stops)
    overlap = 2 if stops else 0
    days_needed = max(drive_days + stop_days - overlap, stop_days, 1)
    time_ok = days_needed <= days
    if not time_ok:
        farthest = route["ordered_stops"][-1]["name"] if route["ordered_stops"] else "a stop"
        problems.append(f"Trip needs ~{days_needed} days but only {days} available.")
        suggestions.append(f"Add ~{days_needed - days} days, or drop the farthest stop ({farthest}).")

    # 3) BUDGET — does the estimated cost fit the budget?
    total = cost["total_pkr"]
    if budget < total:
        budget_status = "over_budget"
        problems.append(f"Estimated cost ~{total:,} PKR but budget is {budget:,} PKR.")
        suggestions.append("Drop a stop, shorten the trip, pick a cheaper stay tier, or raise the budget.")
    elif budget < total * 1.2:
        budget_status = "tight"
    else:
        budget_status = "comfortable"

    feasible = not out_of_season and time_ok and budget >= total

    return {
        "feasible": feasible,
        "month": month, "month_name": month_name,
        "season": {"out_of_season": [s["name"] for s in out_of_season]},
        "time": {"days_available": days, "days_needed": days_needed,
                 "drive_days": drive_days, "stop_days": stop_days, "ok": time_ok},
        "budget": {"budget_pkr": budget, "trip_cost_pkr": total, "status": budget_status},
        "problems": problems,
        "suggestions": suggestions,
    }


# =========================================================================
# Demo — the full pipeline on three scenarios
# =========================================================================
def _run(label, stop_ids, start_city, group_type, days, budget, month):
    print("\n" + "=" * 64)
    print(f"{label}: {group_type}, {days} days, {budget:,} PKR, {MONTHS[month]}, from {start_city}")
    print("=" * 64)
    route = build_route(stop_ids, start_city)
    cost = estimate_cost(route, group_type, days)
    feas = check_feasibility(route, cost, budget, days, month)

    print("Route:", " -> ".join(s["name"] for s in route["ordered_stops"]),
          f"| ~{route['est_round_trip_drive_hours']}h round-trip driving")
    print(f"Cost:  {cost['total_pkr']:,} PKR ({cost['transport']})  {cost['breakdown_pkr']}")
    opts = cost["transport_options"]
    print(f"       car: {opts['car']['cost']:,} ({opts['car']['one_way_hours']}h one-way)  |  "
          f"local: {opts['local']['cost']:,} ({opts['local']['one_way_hours']}h one-way)")
    verdict = "FEASIBLE" if feas["feasible"] else "NOT FEASIBLE"
    print(f"Verdict: {verdict}  (budget: {feas['budget']['status']})")
    for p in feas["problems"]:
        print("   problem:   ", p)
    for s in feas["suggestions"]:
        print("   suggestion:", s)


if __name__ == "__main__":
    # 1) A realistic, just-feasible trip.
    _run("SCENARIO 1 (should be feasible)",
         ["hunza-valley"], "Islamabad", "family", 8, 300000, 7)

    # 2) Same trip, far too little money -> budget re-plan trigger.
    _run("SCENARIO 2 (over budget)",
         ["hunza-valley"], "Islamabad", "family", 8, 100000, 7)

    # 3) Wrong season -> Naran is snowed shut in March.
    _run("SCENARIO 3 (out of season)",
         ["naran-kaghan"], "Islamabad", "couple", 6, 250000, 3)

    # 4) Too much in too few days -> time re-plan trigger.
    _run("SCENARIO 4 (too rushed)",
         ["hunza-valley", "skardu", "naran-kaghan"], "Lahore", "friends", 5, 500000, 8)
