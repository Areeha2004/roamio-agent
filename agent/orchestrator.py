"""
Roamio — generate_itinerary() orchestrator
===========================================
The deterministic "agent": turns raw user constraints into a finished itinerary by
sequencing the tools and running the RE-PLAN LOOP when a plan doesn't fit.

    request → search_destinations → build_route → estimate_cost → check_feasibility
                                          ↑__________ re-plan (drop a stop) __________│
                                                       ↓ feasible
                                              write_itinerary → itinerary JSON

The re-plan loop is what makes this an agent and not a one-shot chain: when
check_feasibility says "over budget" or "too rushed", we drop the farthest stop and
try again, recording what we changed so the user sees the reasoning.

Run the demo:  ./venv/Scripts/python.exe agent/orchestrator.py
"""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # Windows console: handle em-dashes/arrows

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "rag"))
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "agent"))

from search import search_destinations
from planning import build_route, estimate_cost, check_feasibility, MONTHS
from writer import write_itinerary

_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}

MAX_REPLANS = 6


def _plan(selected, request):
    """Run the three tools for a given set of stops."""
    route = build_route(selected, request["start_city"])
    cost = estimate_cost(route, request["group_type"], request["days"])
    feas = check_feasibility(route, cost, request["budget_pkr"], request["days"], request["month"])
    return route, cost, feas


def generate_itinerary(request):
    """Take raw user constraints, return a finished itinerary JSON (ITINERARY_SCHEMA)."""
    month_name = MONTHS[request["month"]]

    # 1) RETRIEVE — semantic search by vibe, then keep only in-season destinations
    #    (grounding the season at selection time avoids planning around a closed stop).
    query = f"{request['vibe']} trip in northern Pakistan in {month_name}"
    candidates = search_destinations(query, k=6)
    in_season = [c for c in candidates if request["month"] in _corpus[c["id"]]["open_months"]]
    pool = in_season or candidates  # fall back if nothing is in season

    # 2) Start with a sensible number of stops for the trip length.
    n = min(len(pool), 3, max(1, request["days"] // 3))
    selected = [c["id"] for c in pool[:n]]

    replan_log = []
    route, cost, feas = _plan(selected, request)

    # 3) RE-PLAN LOOP — drop a stop and retry until it fits (or one stop remains).
    attempts = 0
    while not feas["feasible"] and len(selected) > 1 and attempts < MAX_REPLANS:
        attempts += 1
        name_to_id = {s["name"]: s["id"] for s in route["ordered_stops"]}
        out_of_season = feas["season"]["out_of_season"]

        if out_of_season:
            drop = [name_to_id[n] for n in out_of_season if n in name_to_id]
            selected = [s for s in selected if s not in drop]
            replan_log.append(f"Removed {', '.join(out_of_season)} — closed in {month_name}.")
        else:
            farthest = route["ordered_stops"][-1]            # sorted near→far
            reason = "budget" if feas["budget"]["status"] == "over_budget" else "the days available"
            selected = [s for s in selected if s != farthest["id"]]
            replan_log.append(f"Dropped {farthest['name']} to fit {reason}.")

        if not selected:
            break
        route, cost, feas = _plan(selected, request)

    # 4) WRITE — turn the (best) plan into the day-by-day itinerary JSON.
    itinerary = write_itinerary(request, route, cost, feas)
    if "error" in itinerary:
        return itinerary

    # 5) Surface the agent's reasoning to the user.
    if replan_log:
        itinerary["warnings"] = (
            [{"type": "info", "text": "Roamio adjusted your plan: " + " ".join(replan_log)}]
            + itinerary["warnings"]
        )
        itinerary["meta"]["replan_notes"] = replan_log
    return itinerary


def _summary(itin):
    s = itin["summary"]
    print(f"  title:    {s['title']}")
    print(f"  stops:    {', '.join(s['destinations']) or '(none)'}")
    print(f"  feasible: {s['feasible']}  | cost {s['total_cost_pkr'][0]:,}-{s['total_cost_pkr'][1]:,} PKR")
    for note in itin["meta"].get("replan_notes", []):
        print(f"  re-plan:  {note}")
    print(f"  days:     {len(itin['days'])}")


if __name__ == "__main__":
    scenarios = [
        ("Generous budget, 8 days", {"days": 8, "budget_pkr": 500000, "start_city": "Islamabad",
                                     "group_type": "family", "vibe": "Adventure", "month": 7}),
        ("Tight budget → should re-plan", {"days": 8, "budget_pkr": 150000, "start_city": "Lahore",
                                           "group_type": "friends", "vibe": "Adventure", "month": 7}),
        ("Chill short trip", {"days": 3, "budget_pkr": 80000, "start_city": "Islamabad",
                              "group_type": "couple", "vibe": "Chill", "month": 6}),
    ]
    for label, req in scenarios:
        print("\n" + "=" * 64)
        print(label, "->", req)
        print("=" * 64)
        _summary(generate_itinerary(req))
