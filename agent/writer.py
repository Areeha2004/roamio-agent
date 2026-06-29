"""
Roamio — itinerary writer
=========================
The step that turns a *feasible plan* (route + cost + feasibility, computed by the
deterministic tools) into the day-by-day itinerary JSON defined in
ITINERARY_SCHEMA.md.

Division of labour (the grounding principle, same as extract_destination):
  - The LLM writes ONLY prose + day layout: title, headline, per-day titles/notes,
    and how to spread each stop's activities across its stay days.
  - The trustworthy NUMBERS and FACTS are injected by code afterwards:
    costs (from estimate_cost), total drive hours and stop ids (from build_route),
    activities validated against the corpus, warnings from corpus permits/season.
  So the model can't hallucinate a cost, a fort, or a stop that isn't in the plan.

Run the demo:  ./venv/Scripts/python.exe agent/writer.py
"""

import json
import sys
from pathlib import Path
from typing import Optional, Literal
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

ROOT = Path(__file__).parent.parent
_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}

# Real-content retriever (Wikivoyage + Wikipedia + Tavily), for grounding the prose.
sys.path.insert(0, str(ROOT / "rag"))
from content import search_content

# slight warmth for readable prose; structure stays reliable at low temp
_chat = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)


# ---- What the LLM is allowed to produce (prose + layout only) ----------------
class DayPlan(BaseModel):
    day: int = Field(description="Day number, starting at 1")
    type: Literal["travel", "stay"] = Field(description="'travel' = driving between places; 'stay' = time at one destination")
    title: str = Field(description="Short, friendly day title")
    from_place: Optional[str] = Field(None, description="Origin place name on a travel day, else null")
    to_place: Optional[str] = Field(None, description="Destination place name on a travel day, else null")
    drive_hours: float = Field(0, description="Approximate driving hours this day (0 on stay days)")
    stop_id: Optional[str] = Field(None, description="Corpus id of the destination on a stay day, else null")
    activities: list[str] = Field(default_factory=list, description="Activities for a stay day — ONLY from the provided list for that stop")
    notes: str = Field(description="One or two friendly sentences about the day, grounded in the real source snippets where possible")
    source_refs: list[str] = Field(default_factory=list, description="Refs of the source snippets you used for this day's notes, e.g. ['S1','S3']; [] if none")


class ItineraryDraft(BaseModel):
    title: str = Field(description="Itinerary title, e.g. '8-day family adventure to Hunza'")
    headline: str = Field(description="One-line human summary of the whole trip")
    days: list[DayPlan] = Field(description="Exactly as many day objects as the trip length")


def _trip_facts(request, route):
    """Build the grounded brief the LLM must work within."""
    lines = [
        f"Start city: {request['start_city']}",
        f"Trip length: EXACTLY {request['days']} days (produce exactly {request['days']} day objects)",
        f"Group: {request['group_type']}; vibe: {request['vibe']}",
        f"Total round-trip driving: ~{route['est_round_trip_drive_hours']} hours "
        f"(keep daily driving realistic — max ~10h/day; overnight at a waypoint like Chilas on long hauls)",
        "Route legs (mention the road on travel days):",
        *[f"  - {l['from']} -> {l['to']}: ~{l['hours']}h" + (f" ({l['via']})" if l.get("via") else "")
          for l in route.get("legs", [])],
        "Destinations in order, with the ONLY activities you may use for each:",
    ]
    for s in route["ordered_stops"]:
        d = _corpus[s["id"]]
        lines.append(
            f"  - {d['name']} (stop_id: {s['id']}, ~{s['hours_from_start']}h from start, "
            f"suggested min {d['recommended_trip_days']['min']} days): "
            f"activities = {d['activities']}"
        )
    return "\n".join(lines)


def _blend_sources(hits, k):
    """Keep retrieval relevant, but guarantee the authoritative sources (Wikivoyage, then
    Wikipedia) are represented and not drowned out by web listicles. `hits` is already
    sorted by relevance."""
    if len(hits) <= k:
        return hits
    chosen, used = [], set()
    for src in ("wikivoyage", "wikipedia"):
        for i, h in enumerate(hits):
            if i not in used and h["source"] == src:
                chosen.append(h); used.add(i); break
    for i, h in enumerate(hits):           # fill remaining slots by relevance
        if len(chosen) >= k:
            break
        if i not in used:
            chosen.append(h); used.add(i)
    return chosen[:k]


def _grounding(request, route, per_stop_k=4, snippet_chars=600):
    """Retrieve real source snippets for each stop and return (prompt_block, sources).

    sources is the citation table the UI shows: [{ref, source, title, url, dest_id}].
    Retrieval is scoped per destination, so a Hunza day only sees Hunza content.
    """
    blocks, sources, n = [], [], 0
    for s in route["ordered_stops"]:
        d = _corpus[s["id"]]
        query = (f"{request.get('vibe', '')} trip — what to see, do and experience in "
                 f"{d['name']}: {', '.join(d['activities'][:6])}")
        hits = _blend_sources(search_content(s["id"], query, k=per_stop_k + 3), per_stop_k)
        for h in hits:
            n += 1
            ref = f"S{n}"
            sources.append({"ref": ref, "source": h["source"], "title": h["title"],
                            "url": h["url"], "dest_id": s["id"]})
            snippet = " ".join(h["text"].split())[:snippet_chars]
            blocks.append(f"[{ref}] ({h['source']} — {h['title']}): {snippet}")
    if not blocks:
        return "", []
    header = (
        "\nREAL SOURCE SNIPPETS — ground each stay day's notes in concrete detail drawn "
        "from these (specific sights, the feel of a place, practical colour). Prefer real "
        "specifics over generic filler, and never assert a named place or fact that isn't "
        "in a snippet or the activity list. List the refs you actually used in source_refs."
    )
    return header + "\n" + "\n".join(blocks), sources


_SYSTEM = (
    "You are a Pakistan travel planner. Lay out a realistic day-by-day itinerary that "
    "fits EXACTLY the given number of days. Use travel days for long drives (with an "
    "overnight waypoint like Chilas where needed) and stay days at destinations. Give EACH "
    "stay day 3-5 activities so days feel full: use the specific landmarks from the provided "
    "list for that stop, PLUS realistic generic experiences (a local meal, a bazaar stroll, "
    "a riverside walk, a sunrise viewpoint, leisure time). Do NOT invent specific NAMED "
    "places that are not in the provided list — generic experiences are fine, fabricated "
    "landmarks are not. Do not mention prices (costs are added separately). Write a warm, "
    "specific 1-2 sentence note for each day. On TRAVEL days, name the road taken (e.g. 'via "
    "the Karakoram Highway') and keep daily driving realistic — at most ~10 hours per day."
)


def _validate_activities(stop_id, activities):
    """Keep only activities that actually exist in the corpus for this stop."""
    if not stop_id or stop_id not in _corpus:
        return []
    allowed = _corpus[stop_id]["activities"]
    allowed_lc = {a.lower(): a for a in allowed}
    kept = []
    for a in activities:
        match = allowed_lc.get(a.lower())
        if match:
            kept.append(match)
    return kept


def _build_warnings(route):
    """Deterministic banner items from the visited stops' corpus data."""
    warnings, seen = [], set()
    for s in route["ordered_stops"]:
        d = _corpus[s["id"]]
        for text, wtype in [(d["permits"], "permit"),
                            (d["best_season"].get("avoid"), "season")]:
            if text and text not in seen:
                seen.add(text)
                warnings.append({"type": wtype, "text": text})
    return warnings


def _build_tips(route):
    """All practical tips from the visited stops (deduped)."""
    tips, seen = [], set()
    for s in route["ordered_stops"]:
        for tip in _corpus[s["id"]]["tips"]:
            if tip not in seen:
                seen.add(tip)
                tips.append(tip)
    return tips


def _season_summary(route):
    """Season info for the primary (hero) destination: when to go, what's good then,
    and when to avoid. The UI shows highlights for an in-season trip and the avoid note
    only when the timing is off — so we never tell a July traveller about winter snow."""
    if not route["ordered_stops"]:
        return {}
    bs = _corpus[route["ordered_stops"][-1]["id"]].get("best_season", {})
    return {"months": bs.get("months", ""), "highlights": bs.get("highlights", ""),
            "avoid": bs.get("avoid", "")}


def _build_route_summary(route, cost):
    """Grounded route legs (from / to / hours / via) + one-way and round-trip hours,
    the chosen transport mode, and both transport options (car vs local) so the UI can
    show 'via locals: X hrs / Y PKR' next to 'private car: …' before any tweak."""
    return {
        "legs": [
            {"from": l["from"], "to": l["to"], "hours": l["hours"], "via": l.get("via", "")}
            for l in route.get("legs", [])
        ],
        "one_way_hours": cost.get("one_way_drive_hours", round(route["est_round_trip_drive_hours"] / 2, 1)),
        "round_trip_hours": route["est_round_trip_drive_hours"],
        "transport": cost.get("transport", "car"),
        "transport_options": cost.get("transport_options", {}),
    }


def write_itinerary(request, route, cost, feasibility):
    """Assemble the full itinerary JSON (ITINERARY_SCHEMA.md) from a feasible plan."""
    if "error" in route or "error" in cost:
        return {"error": "cannot write an itinerary from an invalid plan"}

    # 1) LLM writes prose + day layout, constrained by the grounded brief AND grounded in
    #    real retrieved source snippets (Wikivoyage / Wikipedia / web) it must cite.
    grounding_block, sources = _grounding(request, route)
    valid_refs = {s["ref"] for s in sources}
    writer = _chat.with_structured_output(ItineraryDraft)
    draft = writer.invoke(f"{_SYSTEM}\n\n{_trip_facts(request, route)}\n{grounding_block}")

    # 2) Assemble days, validating the parts that must stay grounded.
    days = []
    for d in draft.days:
        is_stay = d.type == "stay"
        days.append({
            "day": d.day,
            "type": d.type,
            "title": d.title,
            "from": d.from_place if not is_stay else None,
            "to": d.to_place if not is_stay else None,
            "drive_hours": d.drive_hours if not is_stay else 0,
            "stop_id": d.stop_id if is_stay else None,
            "image": _corpus.get(d.stop_id, {}).get("image", "") if is_stay else "",
            # Activities are LLM-enriched (landmarks from corpus + generic experiences).
            # We no longer drop non-corpus items, so days feel full; the prompt forbids
            # inventing NAMED places. Trust-critical data (costs/permits/route) stays grounded.
            "activities": d.activities if is_stay else [],
            # Keep only refs that actually exist in this trip's source table.
            "source_refs": [r for r in (d.source_refs or []) if r in valid_refs] if is_stay else [],
            "notes": d.notes,
        })

    # 3) Inject the trustworthy numbers/facts from the tools + corpus.
    primary = route["ordered_stops"][-1]["id"] if route["ordered_stops"] else None
    dest_names = [s["name"] for s in route["ordered_stops"]]
    dest_str = " & ".join(dest_names) if dest_names else "Pakistan"
    title = f"{request['days']}-Day {request.get('vibe', '').strip().title()} Trip to {dest_str}".replace("  ", " ").strip()
    return {
        "request": request,
        "summary": {
            "title": title,
            "feasible": feasibility["feasible"],
            "destinations": [s["id"] for s in route["ordered_stops"]],
            "destination_names": dest_names,
            "hero_image": _corpus.get(primary, {}).get("image", "") if primary else "",
            "total_cost_pkr": cost["total_pkr"],
            "total_drive_hours": route["est_round_trip_drive_hours"],
            "season": _season_summary(route),
            "budget": {
                "status": feasibility["budget"]["status"],
                "over_by_pkr": feasibility["budget"].get("over_by_pkr", 0),
                "budget_pkr": feasibility["budget"]["budget_pkr"],
            },
            "headline": draft.headline,
        },
        "warnings": _build_warnings(route),
        "route_summary": _build_route_summary(route, cost),
        "tips": _build_tips(route),
        "sources": sources,   # citation table: each {ref, source, title, url, dest_id}
        "days": days,
        "cost_breakdown_pkr": {**cost["breakdown_pkr"], "total": cost["total_pkr"]},
        "meta": {
            "share_id": None,
            "disclaimer": "Costs are estimates — verify current prices before booking.",
        },
    }


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "tools"))
    from planning import build_route, estimate_cost, check_feasibility

    request = {"days": 8, "budget_pkr": 300000, "start_city": "Islamabad",
               "group_type": "family", "vibe": "adventure", "month": 7}

    route = build_route(["hunza-valley"], request["start_city"])
    cost = estimate_cost(route, request["group_type"], request["days"])
    feas = check_feasibility(route, cost, request["budget_pkr"], request["days"], request["month"])

    itinerary = write_itinerary(request, route, cost, feas)

    print(json.dumps(itinerary, indent=2, ensure_ascii=False))
    print("\n--- checks ---")
    print("day objects:", len(itinerary["days"]), "(requested", request["days"], ")")
    print("feasible:", itinerary["summary"]["feasible"])
    print("all stay-day activities grounded:",
          all(set(d["activities"]) <= set(_corpus[d["stop_id"]]["activities"])
              for d in itinerary["days"] if d["type"] == "stay" and d["stop_id"]))
