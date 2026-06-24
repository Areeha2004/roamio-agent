"""
Roamio API — FastAPI server
===========================
Exposes the agent over HTTP so the Next.js frontend can call it.

    POST /generate-itinerary   { days, budget, startCity, groupType, vibe, month }
        -> generate_itinerary(...)  -> itinerary JSON (ITINERARY_SCHEMA.md)

The request body matches the frontend's PlanForm exactly, so the UI can POST its
form object as-is. CORS is open to the Next.js dev origin.

Run:  ./venv/Scripts/python.exe -m uvicorn api.main:app --reload --port 8000
"""

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "agent"))
from orchestrator import generate_itinerary  # noqa: E402

app = FastAPI(title="Roamio API", version="0.1.0")

# Let the Next.js dev server (and Vite, just in case) call us from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlanRequest(BaseModel):
    """Mirrors the frontend PlanForm (camelCase) so the UI posts as-is."""
    days: int = Field(ge=1, le=30)
    budget: int = Field(ge=0)            # PKR
    startCity: str
    groupType: str                       # Solo | Couple | Friends | Family
    vibe: str                            # Adventure | Chill | Photography | Religious
    month: int = Field(ge=1, le=12)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-itinerary")
def generate(req: PlanRequest):
    # Map the frontend's shape to what generate_itinerary expects.
    request = {
        "days": req.days,
        "budget_pkr": req.budget,
        "start_city": req.startCity,
        "group_type": req.groupType.lower(),
        "vibe": req.vibe,
        "month": req.month,
    }
    try:
        result = generate_itinerary(request)
    except Exception as e:  # surface unexpected failures as 500s, not silent hangs
        raise HTTPException(status_code=500, detail=f"itinerary generation failed: {e}")

    if isinstance(result, dict) and "error" in result:
        # e.g. an unsupported start city
        raise HTTPException(status_code=400, detail=result)
    return result
