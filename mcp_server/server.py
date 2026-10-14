"""
Roamio MCP server — the planning tools, exposed over the Model Context Protocol
================================================================================
Lets any MCP client (Claude Desktop, MCP Inspector, an agent of your own) call
Roamio's trip-planning primitives as typed tools.

WHAT IS EXPOSED — and why only this much:

  list_origin_cities   discovery; without it a caller guesses a city and gets an error
  search_destinations  RAG #1 — semantic search over the corpus + the tag re-rank
  get_destination      detail lookup for one place
  build_route          deterministic routing, with the northern upper-bound warning
  plan_trip            route + cost + feasibility composed into one verdict

  NOT exposed: the itinerary writer, the faithfulness judge, the tweak parser, and
  anything that writes to Supabase. Those are slow (~8s), cost money per call, and are
  non-deterministic. MCP tools should be cheap, fast and safe to call repeatedly — so
  this server is the deterministic half of Roamio plus retrieval, nothing else.

DESIGN NOTE — tools take scalars, not objects. Internally the chain is
build_route -> estimate_cost -> check_feasibility, each consuming the previous dict.
Making a caller pass a large route object back in would be a poor tool interface, so
each tool takes plain arguments and recomposes internally. Route computation is pure
arithmetic over a 15-entry corpus, so recomputing costs microseconds.

Run:      ./venv/Scripts/python.exe mcp_server/server.py
Inspect:  npx @modelcontextprotocol/inspector ./venv/Scripts/python.exe mcp_server/server.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
for sub in ("rag", "tools"):
    sys.path.insert(0, str(ROOT / sub))

from mcp.server.mcpserver import MCPServer  # noqa: E402

from planning import (  # noqa: E402
    MONTHS,
    build_route as _build_route,
    check_feasibility as _check_feasibility,
    estimate_cost as _estimate_cost,
)

_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}
_origins = json.loads((ROOT / "corpus" / "origin_hubs.json").read_text(encoding="utf-8"))["origins"]

# Named `server`, not `mcp` — a module-level `mcp` would shadow the SDK package.
server = MCPServer("roamio")


# ── Discovery ────────────────────────────────────────────────────────────────
@server.tool()
def list_origin_cities() -> dict:
    """List the Pakistani cities a trip can start from, with drive hours to the Islamabad hub.

    Call this before build_route or plan_trip if you are unsure whether a city is supported.
    Cities marked side="north" are already inside the northern corridor, so their drive-time
    estimates are UPPER BOUNDS rather than precise figures.
    """
    return {
        "count": len(_origins),
        "cities": sorted(
            [{"city": k.replace("_", " ").title(), "hours_to_hub": v["hours_to_hub"],
              "side": v.get("side", "south")} for k, v in _origins.items()],
            key=lambda c: c["hours_to_hub"],
        ),
    }


# ── Retrieval (RAG #1) ───────────────────────────────────────────────────────
@server.tool()
def search_destinations(query: str, month: int = 0, limit: int = 5) -> dict:
    """Find Northern Pakistan destinations matching a free-text description of a trip.

    Semantic search over a hand-curated corpus of 15 destinations, then re-ranked by how
    many of the query's themes match each destination's tags — so an explicit interest
    outranks a merely similar-sounding description.

    Args:
        query: what the traveller wants, e.g. "glaciers and heritage, off the beaten path".
        month: travel month 1-12. If given, destinations closed that month are excluded.
        limit: how many results to return (1-15).

    Returns destinations with their id (use it with the other tools), tags and cosine
    distance (lower is a closer match; rank by it, don't threshold on it).
    """
    from search import search_destinations as _search  # imported lazily: needs an API key

    limit = max(1, min(limit, 15))
    hits = _search(query, k=15)

    if 1 <= month <= 12:
        in_season = [h for h in hits if month in _corpus[h["id"]]["open_months"]]
        hits, season_note = (in_season, None) if in_season else (
            hits, f"No destination is open in {MONTHS[month]}; showing all matches instead.")
    else:
        season_note = None

    # Re-rank by tag overlap with the query, cosine distance breaking ties (ADR #010).
    terms = {w.strip(".,").lower() for w in query.split()}
    def rank(h):
        tags = {t.lower() for t in _corpus[h["id"]]["tags"]}
        return (-len(tags & terms), h["distance"])

    results = [
        {"id": h["id"], "name": h["name"], "region": h["region"],
         "tags": _corpus[h["id"]]["tags"], "distance": h["distance"],
         "open_months": _corpus[h["id"]]["open_months"],
         "recommended_days": _corpus[h["id"]]["recommended_trip_days"]}
        for h in sorted(hits, key=rank)[:limit]
    ]
    out = {"query": query, "results": results}
    if season_note:
        out["note"] = season_note
    return out


@server.tool()
def get_destination(destination_id: str) -> dict:
    """Full curated detail for one destination: season, costs, permits, activities and tips.

    Args:
        destination_id: an id from search_destinations, e.g. "hunza-valley".

    Every field is hand-verified rather than model-generated — drive times, permit rules and
    open months in particular, because the planning tools compute on them.
    """
    d = _corpus.get(destination_id)
    if not d:
        return {"error": f"unknown destination '{destination_id}'",
                "known_ids": sorted(_corpus.keys())}
    return {
        "id": d["id"], "name": d["name"], "region": d["region"], "tags": d["tags"],
        "description": d["description"],
        "open_months": d["open_months"],
        "best_season": d["best_season"],
        "recommended_trip_days": d["recommended_trip_days"],
        "hours_from_islamabad": d["drive_times"]["from_islamabad"],
        "cost_ranges_pkr": d["cost_ranges"],
        "permits": d["permits"],
        "activities": d["activities"],
        "tips": d["tips"],
    }


# ── Deterministic planning ───────────────────────────────────────────────────
@server.tool()
def build_route(destination_ids: list[str], start_city: str = "Islamabad") -> dict:
    """Order destinations and estimate round-trip driving hours from a start city.

    Routes are composed as (start city -> Islamabad hub) + (hub -> destination), which is
    accurate because Northern Pakistan road travel genuinely funnels through the Islamabad
    corridor. For origins already in the north the result is an upper bound and says so.

    Args:
        destination_ids: ids from search_destinations.
        start_city: see list_origin_cities for supported values.
    """
    route = _build_route(destination_ids, start_city)
    if "error" in route:
        return route
    return {
        "start_city": route["start_city"],
        "ordered_stops": route["ordered_stops"],
        "legs": route["legs"],
        "round_trip_drive_hours": route["est_round_trip_drive_hours"],
        "unknown_ids": route["unknown_ids"],
        "warnings": route["warnings"],
    }


@server.tool()
def plan_trip(
    destination_ids: list[str],
    days: int,
    budget_pkr: int,
    month: int,
    start_city: str = "Islamabad",
    group_type: str = "couple",
    stay_style: str = "standard",
    transport: str = "car",
) -> dict:
    """Route, cost and feasibility-check a trip in one call. The core planning tool.

    All of it is deterministic Python over curated data — no model is involved, so the same
    inputs always give the same verdict.

    Feasibility fails for three reasons, each reported separately:
      season  - a stop is closed in the travel month
      time    - driving plus minimum stay exceeds the days available
      budget  - cost exceeds the budget by more than a 25,000 PKR buffer

    A trip inside that buffer stays feasible and is flagged "slightly_over" rather than being
    rejected — being a little over on a trip that matches what you asked for beats a cheaper
    trip that doesn't.

    Args:
        destination_ids: ids from search_destinations.
        days: trip length, 1-30.
        budget_pkr: total budget in Pakistani rupees.
        month: travel month, 1-12.
        start_city: see list_origin_cities.
        group_type: solo | couple | friends | family (sets people and room count).
        stay_style: budget | standard | luxury (where hotels and food sit in each range).
        transport: car (private, per group) | local (public, per person, ~20% slower).
    """
    route = _build_route(destination_ids, start_city)
    if "error" in route:
        return route
    cost = _estimate_cost(route, group_type, days, stay_style, transport)
    if "error" in cost:
        return cost
    feas = _check_feasibility(route, cost, budget_pkr, days, month)

    return {
        "feasible": feas["feasible"],
        "verdict": {
            "season": feas["season"],
            "time": feas["time"],
            "budget": feas["budget"],
        },
        "problems": feas["problems"],
        "suggestions": feas["suggestions"],
        "route": {
            "start_city": route["start_city"],
            "stops": [s["name"] for s in route["ordered_stops"]],
            "round_trip_drive_hours": route["est_round_trip_drive_hours"],
            "warnings": route["warnings"],
        },
        "cost_pkr": {
            "total": cost["total_pkr"],
            "breakdown": cost["breakdown_pkr"],
            "hotel_per_night": cost["hotel_per_night_pkr"],
            "transport_options": cost["transport_options"],
        },
        "month": feas["month_name"],
    }


if __name__ == "__main__":
    server.run()  # stdio transport — the default for local MCP clients
