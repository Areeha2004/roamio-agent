"""
Roamio — generate_itinerary() as a LangGraph state machine
==========================================================
The deterministic orchestrator, expressed as a LangGraph StateGraph: nodes + a
CONDITIONAL re-plan edge (the canonical 'agent' shape), plus a live-conditions node
(Tavily web search) for freshness over the static corpus.

    START → search → plan ──feasible?──► conditions → write → END
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
from web_search import web_search
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}

MAX_REPLANS = 6
_conditions_chat = ChatOpenAI(model="gpt-4o-mini", temperature=0)


class TripState(TypedDict):
    """The shared state that flows through the graph's nodes."""
    request: dict
    stops: list
    route: Optional[dict]
    cost: Optional[dict]
    feasibility: Optional[dict]
    live_conditions: list
    itinerary: Optional[dict]
    replan_count: int
    replan_notes: list
    transport: str
    pool: list


# ── Nodes (each reads the state, returns the keys it updates) ─────────────────
def search_node(state: TripState) -> dict:
    """RETRIEVE: search by vibe + interests, then RE-RANK by how well each destination's
    tags match the requested vibes/interests (so the choice reflects the inputs, not just
    a generic best-match). Drops excluded & out-of-season stops."""
    req = state["request"]
    month_name = MONTHS[req["month"]]
    interests = req.get("interests", [])
    query = f"{req['vibe']} {' '.join(interests)} trip in northern Pakistan in {month_name}".replace("  ", " ").strip()
    candidates = search_destinations(query, k=12)
    in_season = [c for c in candidates if req["month"] in _corpus[c["id"]]["open_months"]]
    pool = in_season or candidates

    # drop excluded destinations ("somewhere else" / "remove X"), by name or id
    exclude = {e.strip().lower() for e in req.get("exclude", [])}
    if exclude:
        kept = [c for c in pool if c["name"].lower() not in exclude and c["id"].lower() not in exclude]
        pool = kept or pool  # never empty the pool entirely

    # re-rank: destinations whose tags overlap the requested vibes/interests come first,
    # ties broken by semantic distance. This stops one generic match dominating everything.
    requested = {t.lower() for t in [req["vibe"], *interests]}
    def rank(c):
        tags = {t.lower() for t in _corpus[c["id"]]["tags"]}
        return (-len(tags & requested), c["distance"])
    pool = sorted(pool, key=rank)

    ranked = [c["id"] for c in pool]
    n = min(len(ranked), 3, max(1, req["days"] // 3))
    return {"stops": ranked[:n], "pool": ranked, "transport": req.get("transport", "car"),
            "replan_count": 0, "replan_notes": []}


def plan_node(state: TripState) -> dict:
    """ROUTE → COST → FEASIBILITY for the current set of stops & transport mode."""
    req = state["request"]
    route = build_route(state["stops"], req["start_city"])
    cost = estimate_cost(route, req["group_type"], req["days"], req.get("style", "standard"),
                         state.get("transport", "car"))
    feas = check_feasibility(route, cost, req["budget_pkr"], req["days"], req["month"])
    return {"route": route, "cost": cost, "feasibility": feas}


def _hub_hours(cid):
    """Drive hours from the Islamabad hub — a proxy for how 'far/expensive' a stop is."""
    return _corpus[cid]["drive_times"]["from_islamabad"]["max_hours"]


def replan_node(state: TripState) -> dict:
    """RE-PLAN. out-of-season → drop. Over budget → first switch to cheaper transport,
    then SWAP the priciest stop for a closer/cheaper one (e.g. Skardu → Murree); too
    rushed → swap or drop the farthest."""
    req = state["request"]
    route, feas = state["route"], state["feasibility"]
    stops = list(state["stops"])
    notes = list(state["replan_notes"])
    transport = state.get("transport", "car")
    month_name = MONTHS[req["month"]]
    name_to_id = {s["name"]: s["id"] for s in route["ordered_stops"]}

    out = feas["season"]["out_of_season"]
    if out:
        drop = [name_to_id[n] for n in out if n in name_to_id]
        stops = [s for s in stops if s not in drop]
        notes.append(f"Removed {', '.join(out)} — closed in {month_name}.")
        return {"stops": stops, "replan_notes": notes, "replan_count": state["replan_count"] + 1}

    over_budget = feas["budget"]["status"] == "over_budget"

    # Swap/drop the farthest (priciest) stop — but any swap MUST still match the requested
    # vibe/interests, so we never turn a 'glaciers & heritage' trip into an unrelated
    # hill-station run. We also respect the user's transport choice: we don't silently
    # switch car → local here ('Make it cheaper' does that explicitly at their request).
    requested = {t.lower() for t in [req.get("vibe", ""), *req.get("interests", [])] if t}
    def on_theme(cid):
        return not requested or bool({t.lower() for t in _corpus[cid]["tags"]} & requested)

    farthest = route["ordered_stops"][-1]
    reason = "budget" if over_budget else "the days available"
    cheaper = next(
        (cid for cid in sorted(state.get("pool", []), key=_hub_hours)
         if cid not in stops and _hub_hours(cid) < _hub_hours(farthest["id"]) and on_theme(cid)),
        None,
    )

    def note(msg):
        if msg not in notes:
            notes.append(msg)

    if cheaper:
        stops = [cheaper if s == farthest["id"] else s for s in stops]
        note(f"Swapped {farthest['name']} for {_corpus[cheaper]['name']} to fit {reason}.")
    elif len(stops) > 1:
        stops = [s for s in stops if s != farthest["id"]]
        note(f"Dropped {farthest['name']} to fit {reason}.")
    elif over_budget and transport == "car":
        # Keep the on-theme destination; be honest that it's over budget and how to fix it.
        note(f"{farthest['name']} is over your budget — raise the budget, shorten the trip, "
             f"or switch to local/public transport for a cheaper ride.")
    return {"stops": stops, "replan_notes": notes, "replan_count": state["replan_count"] + 1}


class _LiveConditions(BaseModel):
    notes: list[str] = Field(
        description="0-4 SHORT practical live-condition notes (road open/blocked, weather, "
                    "pass status). Use ONLY the provided snippets; if nothing notable, return []."
    )


def conditions_node(state: TripState) -> dict:
    """LIVE CONDITIONS: Tavily search per stop, summarized into warnings (freshness)."""
    req = state["request"]
    month_name = MONTHS[req["month"]]
    snippets = []
    for s in state["route"]["ordered_stops"][:3]:
        for r in web_search(f"current road conditions and weather {s['name']} Pakistan {month_name} 2026", max_results=2):
            if r["content"]:
                snippets.append(f"[{s['name']}] {r['content'][:300]}")
    if not snippets:
        return {"live_conditions": []}
    prompt = (
        "From these web snippets about a Pakistan trip, give 0-4 SHORT live-condition notes "
        "for a traveller (road open/blocked, weather, pass status). Use ONLY the snippets — "
        "do not invent. Prefer the most recent/relevant. If nothing notable, return [].\n\n"
        "SNIPPETS:\n" + "\n".join(snippets)
    )
    try:
        notes = _conditions_chat.with_structured_output(_LiveConditions).invoke(prompt).notes
    except Exception:
        notes = []
    return {"live_conditions": notes}


def write_node(state: TripState) -> dict:
    """WRITE: turn the (best) plan into the day-by-day itinerary JSON."""
    req = state["request"]
    itinerary = write_itinerary(req, state["route"], state["cost"], state["feasibility"])
    if "error" in itinerary:
        return {"itinerary": itinerary}
    if state["replan_notes"]:
        itinerary["warnings"].insert(0, {"type": "info", "text": "Roamio adjusted your plan: " + " ".join(state["replan_notes"])})
        itinerary["meta"]["replan_notes"] = state["replan_notes"]
    # live conditions go to the very top of the banner (most timely)
    for note in reversed(state.get("live_conditions", []) or []):
        itinerary["warnings"].insert(0, {"type": "live", "text": note})
    return {"itinerary": itinerary}


def decide(state: TripState) -> str:
    """THE CONDITIONAL EDGE: feasible (or out of options) → conditions; else → replan."""
    feas = state["feasibility"]
    if feas.get("feasible"):
        return "conditions"
    if state["replan_count"] >= MAX_REPLANS:
        return "conditions"  # best-effort: out of moves (transport/swap/drop tried)
    return "replan"


# ── Build & compile the graph (once) ─────────────────────────────────────────
def _build_graph():
    g = StateGraph(TripState)
    g.add_node("search", search_node)
    g.add_node("plan", plan_node)
    g.add_node("replan", replan_node)
    g.add_node("conditions", conditions_node)
    g.add_node("write", write_node)
    g.add_edge(START, "search")
    g.add_edge("search", "plan")
    g.add_conditional_edges("plan", decide, {"replan": "replan", "conditions": "conditions"})
    g.add_edge("replan", "plan")
    g.add_edge("conditions", "write")
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
    print(f"  feasible: {s['feasible']}  | cost {s['total_cost_pkr']:,} PKR")
    for note in itin["meta"].get("replan_notes", []):
        print(f"  re-plan:  {note}")
    for w in itin["warnings"]:
        if w["type"] == "live":
            print(f"  live:     {w['text']}")
    print(f"  days:     {len(itin['days'])}")


if __name__ == "__main__":
    req = {"days": 8, "budget_pkr": 500000, "start_city": "Islamabad",
           "group_type": "family", "vibe": "Adventure", "month": 7}
    print("=" * 64)
    print("Generate with live conditions (Tavily)")
    print("=" * 64)
    _summary(generate_itinerary(req))
