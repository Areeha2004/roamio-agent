"""
Roamio — natural-language tweak interpreter
===========================================
Turns a traveller's free-text change request ("skip the long drives and add a couple of
cultural days, keep it under 100k") into a STRUCTURED set of edit operations the frontend
applies deterministically to the plan form, then re-plans.

Same grounding principle as the rest of Roamio: the LLM only INTERPRETS intent into a typed
schema — code validates and applies the actual changes. Resilient: on any failure the caller
falls back to the legacy regex tweak handler, so a tweak never hard-fails.

Test:  ./venv/Scripts/python.exe agent/tweak.py
"""

import sys
from pathlib import Path
from typing import Optional, Literal

from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

VIBES = ["Adventure", "Chill", "Photography", "Religious"]
INTERESTS = ["Lakes", "Trekking", "Waterfalls", "Forests", "Glaciers", "Desert",
             "Camping", "Culture", "Heritage", "Festivals", "Off-the-beaten-path", "Wildlife"]


class TweakOps(BaseModel):
    """The structured edits a free-text tweak maps to. Every field is optional; the caller
    applies only what's set, validating/clamping each one."""
    set_days: Optional[int] = Field(None, description="Absolute new trip length when the user gives a number, e.g. 'make it 6 days'")
    days_delta: Optional[int] = Field(None, description="Relative change in days, e.g. 'two more days' -> 2, 'a day shorter' -> -1")
    set_budget_pkr: Optional[int] = Field(None, description="Absolute new budget in PKR, e.g. 'budget 80k' -> 80000")
    budget_delta_pct: Optional[float] = Field(None, description="Relative budget change in percent, e.g. 'a bit cheaper' -> -15, 'more luxurious' -> 30")
    set_transport: Optional[Literal["car", "local"]] = Field(None, description="'local' for bus/public/cheaper ride; 'car' for a private car")
    set_stay_style: Optional[Literal["budget", "standard", "luxury"]] = Field(None, description="Accommodation tier")
    set_vibe: Optional[Literal["Adventure", "Chill", "Photography", "Religious"]] = Field(None, description="Replace the primary vibe (map: relaxing->Chill, scenic/photos->Photography, spiritual->Religious, trek/adventurous->Adventure)")
    add_interests: list[str] = Field(default_factory=list, description=f"Interests to add, only from: {INTERESTS}")
    remove_interests: list[str] = Field(default_factory=list, description="Interests to remove")
    exclude_destinations: list[str] = Field(default_factory=list, description="Destination names to avoid. For 'somewhere else'/'different place', list the CURRENT destinations here.")
    clear_focus: bool = Field(False, description="True if the user no longer wants the trip anchored on the focused/featured destination (e.g. 'somewhere else')")
    set_month: Optional[int] = Field(None, description="New travel month 1-12 if the user changes when they go")
    unsupported: bool = Field(False, description="True if the request asks for something this northern-Pakistan planner can't do (specific hotels, flights, food orders, non-northern places). Leave all other fields empty then.")
    summary: str = Field("", description="One short, friendly sentence describing the change applied — or why it can't be done if unsupported")


_SYSTEM = (
    "You convert a traveller's free-text change request into structured edits to their existing "
    "Pakistan (northern areas) trip plan. Output ONLY the structured ops.\n"
    "- For any single dimension output EITHER the absolute value OR the delta, NEVER both. "
    "Absolute when a target number is given ('make it 6 days' -> set_days=6; 'budget 80k' -> "
    "set_budget_pkr=80000); delta for relative asks ('two more days'/'a couple more days' -> "
    "days_delta=+2; 'a few more days' -> +3; 'a day shorter' -> -1; 'a bit cheaper' -> "
    "budget_delta_pct=-15). 'keep it under 100k' is an absolute cap -> set_budget_pkr=100000 "
    "(do NOT also set budget_delta_pct).\n"
    "- 'make it cheaper' with no number: prefer set_transport='local' (and/or a small negative "
    "budget_delta_pct). 'more comfort/luxury' -> set_stay_style='luxury' and/or set_transport='car'.\n"
    "- 'somewhere else' / 'different place' -> put the CURRENT destinations in exclude_destinations "
    "and set clear_focus=true. 'remove X' / 'no X' -> exclude_destinations=['X'].\n"
    "- add_interests / remove_interests and set_vibe must use ONLY the allowed values.\n"
    "- If the ask is impossible for this planner (specific hotel bookings, flights, restaurants, "
    "places outside northern Pakistan), set unsupported=true, leave edits empty, and explain in summary.\n"
    "- Always fill summary with a short, friendly description of what you changed."
)


def interpret_tweak(context: dict, tweak: str):
    """Interpret `tweak` against the current plan `context`. Returns a TweakOps dict, or None
    on failure (caller should fall back to the legacy regex tweak)."""
    ctx = (
        f"Current plan: {context.get('days')} days, budget {context.get('budget_pkr')} PKR, "
        f"vibe {context.get('vibe')}, interests {context.get('interests', [])}, "
        f"transport {context.get('transport')}, stay {context.get('style')}, "
        f"month {context.get('month')}, destinations {context.get('destinations', [])}, "
        f"anchored_focus={context.get('has_focus', False)}."
    )
    try:
        ops = _llm.with_structured_output(TweakOps).invoke(
            f"{_SYSTEM}\n\n{ctx}\nUser request: \"{tweak}\"")
        return ops.model_dump()
    except Exception:
        return None


if __name__ == "__main__":
    ctx = {"days": 5, "budget_pkr": 150000, "vibe": "Adventure", "interests": ["lakes"],
           "transport": "car", "style": "standard", "month": 7,
           "destinations": ["Hunza Valley", "Skardu"], "has_focus": True}
    for t in ["skip the long drives and add a couple of cultural days, keep it under 100k",
              "make it cheaper", "somewhere else", "book me a 5-star hotel in Hunza",
              "I want to go in September instead and make it more relaxing"]:
        print(f"\n>>> {t}")
        ops = interpret_tweak(ctx, t)
        print("   ", {k: v for k, v in (ops or {}).items() if v not in (None, [], False, "")})
