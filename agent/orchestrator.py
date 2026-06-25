"""
Roamio — generate_itinerary() as a LangGraph state machine
==========================================================
Phase 1 of the post-v0 roadmap: the deterministic orchestrator, refactored into a
LangGraph StateGraph. Same behaviour and output — but now expressed as nodes + a
CONDITIONAL re-plan edge (the canonical 'agent' shape), which is the backbone for
streaming (Phase 3) and memory (Phase 4).

    START → search → plan ──feasible?──► write → END
                       ▲          │
                       └─ replan ◄┘   (not feasible: drop a stop, try again)

Run the demo:  ./venv/Scripts/python.exe agent/orchestrator.py
"""

import json
import sys
from pathlib import Path
from typing import Optional, TypedDict

sys.stdout.reconfigure(encoding="utf-8")  # Windows console: em-dashes/arrows

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "rag"))
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "agent"))

from search import search_destinations
from planning import build_route, estimate_cost, check_feasibility, MONTHS
from writer import write_itinerary
from langgraph.graph import StateGraph, START, END

_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}

MAX_REPLANS = 6


class TripState(TypedDict):
    """The shared state that flows through the graph's nodes."""
    request: dict
    stops: list
    route: Optional[dict]
    cost: Optional[dict]
    feasibility: Optional[dict]
    itinerary: Optional[dict]
    replan_count: int
    replan_notes: list


# ── Nodes (each reads the state, returns the keys it updates) ─────────────────
def search_node(state: TripState) -> dict:
    """RETRIEVE: semantic search by vibe, keep in-season, pick a starting set."""
    req = state["request"]
    month_name = MONTHS[req["month"]]
    query = f"{req['vibe']} trip in northern Pakistan in {month_name}"
    candidates = search_destinations(query, k=6)
    in_season = [c for c in candidates if req["month"] in _corpus[c["id"]]["open_months"]]
    pool = in_season or candidates
    n = min(len(pool), 3, max(1, req["days"] // 3))
    return {"stops": [c["id"] for c in pool[:n]], "replan_count": 0, "replan_notes": []}


def plan_node(state: TripState) -> dict:
    """ROUTE → COST → FEASIBILITY for the current set of stops."""
    req = state["request"]
    route = build_route(state["stops"], req["start_city"])
    cost = estimate_cost(route, req["group_type"], req["days"])
    feas = check_feasibility(route, cost, req["budget_pkr"], req["days"], req["month"])
    return {"route": route, "cost": cost, "feasibility": feas}


def replan_node(state: TripState) -> dict:
    """RE-PLAN: drop an out-of-season or the farthest stop, recording why."""
    req = state["request"]
    route, feas = state["route"], state["feasibility"]
    stops = list(state["stops"])
    notes = list(state["replan_notes"])
    month_name = MONTHS[req["month"]]
    name_to_id = {s["name"]: s["id"] for s in route["ordered_stops"]}
    out = feas["season"]["out_of_season"]
    if out:
        drop = [name_to_id[n] for n in out if n in name_to_id]
        stops = [s for s in stops if s not in drop]
        notes.append(f"Removed {', '.join(out)} — closed in {month_name}.")
    else:
        farthest = route["ordered_stops"][-1]
        reason = "budget" if feas["budget"]["status"] == "over_budget" else "the days available"
        stops = [s for s in stops if s != farthest["id"]]
        notes.append(f"Dropped {farthest['name']} to fit {reason}.")
    return {"stops": stops, "replan_notes": notes, "replan_count": state["replan_count"] + 1}


def write_node(state: TripState) -> dict:
    """WRITE: turn the (best) plan into the day-by-day itinerary JSON."""
    req = state["request"]
    itinerary = write_itinerary(req, state["route"], state["cost"], state["feasibility"])
    if "error" not in itinerary and state["replan_notes"]:
        itinerary["warnings"] = (
            [{"type": "info", "text": "Roamio adjusted your plan: " + " ".join(state["replan_notes"])}]
            + itinerary["warnings"]
        )
        itinerary["meta"]["replan_notes"] = state["replan_notes"]
    return {"itinerary": itinerary}


def decide(state: TripState) -> str:
    """THE CONDITIONAL EDGE: feasible (or out of options) → write; else → replan."""
    feas = state["feasibility"]
    if feas.get("feasible"):
        return "write"
    if len(state["stops"]) <= 1 or state["replan_count"] >= MAX_REPLANS:
        return "write"  # best-effort: nothing left to drop
    return "replan"


# ── Build & compile the graph (once) ─────────────────────────────────────────
def _build_graph():
    g = StateGraph(TripState)
    g.add_node("search", search_node)
    g.add_node("plan", plan_node)
    g.add_node("replan", replan_node)
    g.add_node("write", write_node)
    g.add_edge(START, "search")
    g.add_edge("search", "plan")
    g.add_conditional_edges("plan", decide, {"replan": "replan", "write": "write"})
    g.add_edge("replan", "plan")
    g.add_edge("write", END)
    return g.compile()


graph = _build_graph()


def generate_itinerary(request: dict) -> dict:
    """Run the planning graph end-to-end and return the itinerary JSON."""
    final = graph.invoke({"request": request})
    return final["itinerary"]


# ── Demo ─────────────────────────────────────────────────────────────────────
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
        ("Tight budget -> should re-plan", {"days": 8, "budget_pkr": 150000, "start_city": "Lahore",
                                            "group_type": "friends", "vibe": "Adventure", "month": 7}),
        ("Chill short trip", {"days": 3, "budget_pkr": 80000, "start_city": "Islamabad",
                              "group_type": "couple", "vibe": "Chill", "month": 6}),
    ]
    for label, req in scenarios:
        print("\n" + "=" * 64)
        print(label)
        print("=" * 64)
        _summary(generate_itinerary(req))
