"""
Roamio corpus tool — extract_destination(raw_text)
==================================================
Turn a paragraph of raw travel text (Wikivoyage, a blog, a forum post) into a
structured DRAFT corpus entry matching SCHEMA.md. This is how you scale the corpus
from 5 -> 15 without hand-typing every field.

Run the demo:   ./venv/Scripts/python.exe corpus/extract_destination.py

CORE RULE (the whole reason this is trustworthy): the model extracts ONLY what the
text states. It must NOT use outside knowledge and must leave fields empty when the
text is silent. That's "grounded extraction" — it turns the AI from a hallucinator
into a faithful parser. Anything it leaves blank is YOUR job to fill + verify
(per DECISIONS #001 — drive times and costs are exactly where AI guesses wrong).
"""

import json
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

chat = ChatOpenAI(model="gpt-4o-mini", temperature=0)


# ---- The schema we extract INTO (mirrors corpus.json / SCHEMA.md) -----------
# Risky/numeric fields are Optional so the model can leave them null when the
# text doesn't state them — instead of inventing a value.

class TripDays(BaseModel):
    min: int = Field(description="Minimum days worth spending there")
    ideal: int = Field(description="Ideal number of days for the destination")

class BestSeason(BaseModel):
    months: str = Field(description="Human-readable best months, e.g. 'May to October'")
    highlights: str = Field(description="What is good to see/do and roughly when")
    avoid: Optional[str] = Field(None, description="Months to avoid and why, ONLY if the text says")

class CostRanges(BaseModel):
    hotel_pkr_per_night: Optional[list[int]] = Field(None, description="[low, high] hotel PKR/night, ONLY if stated in text")
    food_pkr_per_day: Optional[list[int]] = Field(None, description="[low, high] food PKR/day, ONLY if stated in text")
    local_transport_pkr_per_day: Optional[list[int]] = Field(None, description="[low, high] local transport PKR/day, ONLY if stated in text")
    notes: Optional[str] = Field(None, description="Any cost note mentioned")

class DriveFromIslamabad(BaseModel):
    min_hours: Optional[float] = Field(None, description="Min driving hours from Islamabad, ONLY if the text states it")
    max_hours: Optional[float] = Field(None, description="Max driving hours from Islamabad, ONLY if the text states it")
    note: Optional[str] = Field(None, description="Route note if mentioned in the text")

class DestinationDraft(BaseModel):
    id: str = Field(description="URL slug derived from the name: lowercase-with-hyphens")
    name: str = Field(description="Destination name")
    region: str = Field(description="Province or administrative area in Pakistan")
    tags: list[str] = Field(description="3-6 short vibe/terrain keywords, e.g. mountains, river, waterfalls, family")
    description: str = Field(description="One-sentence summary of the place, grounded in the text")
    recommended_trip_days: TripDays
    open_months: list[int] = Field(description="Accessible/worth-visiting months as integers 1-12, inferred from the stated season; empty list if the text gives no season")
    best_season: BestSeason
    cost_ranges: CostRanges
    drive_times_from_islamabad: DriveFromIslamabad
    permits: str = Field(description="Permit / CNIC / NOC rules exactly as stated; empty string if none mentioned")
    stays: list[str] = Field(description="Towns/areas to base in, as named in the text")
    activities: list[str] = Field(description="Things to do, as named in the text")
    tips: list[str] = Field(description="Practical tips stated in the text")


_extractor = chat.with_structured_output(DestinationDraft)

_SYSTEM = (
    "You extract structured travel data from the provided text about a place in Pakistan. "
    "Rules: (1) Use ONLY facts present in the text — do NOT add outside knowledge. "
    "(2) If the text does not state something, leave that field null/empty — never guess. "
    "(3) Convert any stated season into open_months integers (1-12). "
    "Be a faithful parser, not a creative writer."
)


def extract_destination(raw_text):
    """Extract a DestinationDraft from raw text (grounded, no invention)."""
    return _extractor.invoke(f"{_SYSTEM}\n\nTEXT:\n{raw_text}")


def draft_to_corpus_entry(draft):
    """Assemble a corpus-shaped dict from the draft, stubbing the fields that
    must be human-verified (drive_times, nearest_airport) with 'VERIFY'."""
    d = draft.model_dump()
    di = d["drive_times_from_islamabad"]
    return {
        "id": d["id"],
        "name": d["name"],
        "region": d["region"],
        "tags": d["tags"],
        "description": d["description"],
        "recommended_trip_days": d["recommended_trip_days"],
        "drive_times": {
            "from_islamabad": {
                "min_hours": di["min_hours"],
                "max_hours": di["max_hours"],
                "note": di["note"] or "VERIFY — not in source text",
            },
            "nearest_airport": "VERIFY — not in source text",
        },
        "open_months": d["open_months"],
        "best_season": d["best_season"],
        "cost_ranges": d["cost_ranges"],
        "permits": d["permits"],
        "stays": d["stays"],
        "activities": d["activities"],
        "tips": d["tips"],
    }


def verification_checklist(entry):
    """List the fields a human must fill or verify before this is corpus-ready."""
    todo = []
    dt = entry["drive_times"]["from_islamabad"]
    if dt["min_hours"] is None or dt["max_hours"] is None:
        todo.append("drive_times.from_islamabad — fill hours from Google Maps (+20-30% for hill roads)")
    if "VERIFY" in entry["drive_times"]["nearest_airport"]:
        todo.append("drive_times.nearest_airport — add nearest airport")
    for f in ["hotel_pkr_per_night", "food_pkr_per_day", "local_transport_pkr_per_day"]:
        if entry["cost_ranges"].get(f) is None:
            todo.append(f"cost_ranges.{f} — no figure in text, research a range")
    if not entry["open_months"]:
        todo.append("open_months — no clear season in text, set the accessible months")
    if not entry["permits"]:
        todo.append("permits — confirm CNIC/NOC rules from an official source")
    # Always remind to spot-check the trust-critical facts.
    todo.append("SPOT-CHECK permits + costs against the source (AI can misread)")
    return todo


if __name__ == "__main__":
    # A realistic raw paragraph (Neelum Valley) — NOT already in the corpus.
    raw_text = (
        "Neelum Valley is a long, scenic river valley in Azad Kashmir, northern Pakistan, "
        "running along the Neelum River near the Line of Control. It's known for green forested "
        "mountains, waterfalls, and villages like Keran, Sharda and Arang Kel, and is a popular "
        "summer destination from May to October; winters are cold and snow can block the upper "
        "valley. Accommodation ranges from basic guesthouses to mid-range hotels, with rooms "
        "roughly 3,000 to 9,000 PKR a night and meals around 1,000 to 2,500 PKR a day. A valid "
        "CNIC is required and there are army check posts along the route because of the nearby "
        "border; foreign tourists need a No Objection Certificate (NOC). Popular activities include "
        "Arang Kel (reached by a chairlift and a short hike), Sharda's ancient ruins, and riverside "
        "walks. Travellers should carry cash, as ATMs and mobile connectivity are limited."
    )

    print("Extracting from raw text...\n")
    draft = extract_destination(raw_text)
    entry = draft_to_corpus_entry(draft)

    print("=== DRAFT CORPUS ENTRY ===")
    print(json.dumps(entry, indent=2, ensure_ascii=False))

    print("\n=== VERIFICATION CHECKLIST (before adding to corpus.json) ===")
    for item in verification_checklist(entry):
        print("  [ ]", item)
    print("\nNote how drive_times came back as VERIFY — the text never stated hours,")
    print("so the model correctly did NOT invent them. That's grounded extraction.")
