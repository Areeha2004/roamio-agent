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
DRIVE_RATE_PKR_PER_HOUR = (1200, 2500)  # fuel-only -> hired car with driver
MAX_DRIVE_HOURS_PER_DAY = 8


# =========================================================================
# TOOL 1 — build_route
# =========================================================================
def _hours_from_islamabad(dest):
    return dest["drive_times"]["from_islamabad"]["max_hours"]


def _origin_leg(start_city):
    """Returns (hours_to_hub, note, side) or None if the city isn't in the table."""
    key = start_city.strip().lower()
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

    return {
        "start_city": start_city,
        "ordered_stops": [
            {"id": sid, "name": _corpus[sid]["name"],
             "hours_from_start": round(origin_hours + _hours_from_islamabad(_corpus[sid]), 1)}
            for sid in ordered
        ],
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


def estimate_cost(route, group_type, days):
    """Estimate the total trip cost as a [min, max] PKR range.

    Model (confirmed): hotels = rooms x nights x avg nightly range;
    food = people x days x avg daily range; local transport = days x avg daily
    range (per group); long-haul = round-trip drive hours x 1200-2500 PKR/hr.
    Uses low ends for the min total and high ends for the max."""
    if "error" in route:
        return {"error": "cannot cost an invalid route", "route_error": route["error"]}

    stops = [_corpus[s["id"]] for s in route["ordered_stops"]]
    if not stops:
        return {"error": "no stops to cost"}

    people, rooms = GROUP_SIZES.get(group_type, (2, 1))
    nights = max(days - 1, 1)  # final day is the return leg

    h_lo, h_hi = _avg_range(stops, "hotel_pkr_per_night")
    f_lo, f_hi = _avg_range(stops, "food_pkr_per_day")
    l_lo, l_hi = _avg_range(stops, "local_transport_pkr_per_day")
    drive_h = route["est_round_trip_drive_hours"]

    hotels = [rooms * nights * h_lo, rooms * nights * h_hi]
    food = [people * days * f_lo, people * days * f_hi]
    local = [days * l_lo, days * l_hi]
    long_haul = [drive_h * DRIVE_RATE_PKR_PER_HOUR[0], drive_h * DRIVE_RATE_PKR_PER_HOUR[1]]

    def _i(pair):  # round a [lo, hi] pair to ints
        return [int(round(pair[0])), int(round(pair[1]))]

    breakdown = {"hotels": _i(hotels), "food": _i(food),
                 "local_transport": _i(local), "long_haul_transport": _i(long_haul)}
    total = [int(round(hotels[0] + food[0] + local[0] + long_haul[0])),
             int(round(hotels[1] + food[1] + local[1] + long_haul[1]))]

    return {
        "group_type": group_type, "people": people, "rooms": rooms,
        "days": days, "nights": nights,
        "breakdown_pkr": breakdown,
        "total_pkr": total,
        "assumptions": f"{people}p/{rooms}rm; long-haul {drive_h}h x {DRIVE_RATE_PKR_PER_HOUR} PKR/hr",
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

    # 2) TIME — does driving + time at each stop fit in the days available?
    drive_days = math.ceil(route["est_round_trip_drive_hours"] / MAX_DRIVE_HOURS_PER_DAY)
    stop_days = sum(s["recommended_trip_days"]["min"] for s in stops)
    days_needed = drive_days + stop_days
    time_ok = days_needed <= days
    if not time_ok:
        farthest = route["ordered_stops"][-1]["name"] if route["ordered_stops"] else "a stop"
        problems.append(f"Trip needs ~{days_needed} days ({drive_days} driving + {stop_days} at stops) "
                        f"but only {days} available.")
        suggestions.append(f"Add ~{days_needed - days} days, or drop the farthest stop ({farthest}).")

    # 3) BUDGET — can they afford at least the cheapest version?
    total_lo, total_hi = cost["total_pkr"]
    if budget < total_lo:
        budget_status = "over_budget"
        problems.append(f"Cheapest plan is ~{total_lo:,} PKR but budget is {budget:,} PKR.")
        suggestions.append("Drop a stop, shorten the trip, or raise the budget.")
    elif budget < total_hi:
        budget_status = "tight"   # affordable at the budget end of the ranges
    else:
        budget_status = "comfortable"

    feasible = not out_of_season and time_ok and budget >= total_lo

    return {
        "feasible": feasible,
        "month": month, "month_name": month_name,
        "season": {"out_of_season": [s["name"] for s in out_of_season]},
        "time": {"days_available": days, "days_needed": days_needed,
                 "drive_days": drive_days, "stop_days": stop_days, "ok": time_ok},
        "budget": {"budget_pkr": budget, "trip_cost_pkr": [total_lo, total_hi],
                   "status": budget_status},
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
    print(f"Cost:  {cost['total_pkr'][0]:,} - {cost['total_pkr'][1]:,} PKR  {cost['breakdown_pkr']}")
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
