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

import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "agent"))
sys.path.insert(0, str(ROOT / "db"))
from orchestrator import generate_itinerary, graph  # noqa: E402
from store import save_trip, get_trip  # noqa: E402

app = FastAPI(title="Roamio API", version="0.1.0")

# CORS origins: defaults to local dev; in production set ALLOWED_ORIGINS to your
# Vercel URL (comma-separated for multiple), e.g. "https://roamio.vercel.app".
_DEFAULT_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
]
_env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_env_origins or _DEFAULT_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlanRequest(BaseModel):
    """Mirrors the frontend PlanForm (camelCase) so the UI posts as-is."""
    days: int = Field(ge=1, le=30)
    budget: int = Field(ge=0)            # PKR
    startCity: str
    groupType: str                       # Solo | Couple | Friends | Family
    vibe: str                            # primary vibe (drives the title)
    month: int = Field(ge=1, le=12)
    stayStyle: str = "standard"          # budget | standard | luxury (optional)
    interests: list[str] = []            # extra vibes/goals that enrich the search
    exclude: list[str] = []              # destination names/ids to avoid ("somewhere else")


@app.get("/health")
def health():
    return {"status": "ok"}


def _to_request(req: PlanRequest) -> dict:
    """Map the frontend's camelCase form to what the graph expects."""
    return {
        "days": req.days,
        "budget_pkr": req.budget,
        "start_city": req.startCity,
        "group_type": req.groupType.lower(),
        "vibe": req.vibe,
        "month": req.month,
        "style": (req.stayStyle or "standard").lower(),
        "interests": [i.strip() for i in (req.interests or [])],
        "exclude": [e.strip() for e in (req.exclude or [])],
    }


@app.post("/generate-itinerary")
def generate(req: PlanRequest):
    """Non-streaming: returns the full itinerary in one response."""
    request = _to_request(req)
    try:
        result = generate_itinerary(request)
    except Exception as e:  # surface unexpected failures as 500s, not silent hangs
        raise HTTPException(status_code=500, detail=f"itinerary generation failed: {e}")
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result)  # e.g. unsupported start city
    share_id = save_trip(request, result)
    if share_id:
        result["meta"]["share_id"] = share_id
    return result


# Human-friendly progress labels per graph node (used by the stream).
_NODE_LABELS = {
    "search": "Searching destinations…",
    "plan": "Building route & checking budget…",
    "replan": "Adjusting the plan to fit…",
    "conditions": "Checking live road & weather…",
    "write": "Writing your day-by-day itinerary…",
}


@app.post("/generate-itinerary/stream")
def generate_stream(req: PlanRequest):
    """Stream graph progress as newline-delimited JSON, then the final itinerary.
    Events: {"type":"progress","label":...} per node, then {"type":"result","itinerary":...}."""
    request = _to_request(req)

    def gen():
        itinerary = None
        try:
            for chunk in graph.stream({"request": request}, stream_mode="updates"):
                for node, update in chunk.items():
                    yield json.dumps({"type": "progress", "node": node,
                                      "label": _NODE_LABELS.get(node, "Working…")}) + "\n"
                    if isinstance(update, dict) and update.get("itinerary") is not None:
                        itinerary = update["itinerary"]
            if itinerary and "error" not in itinerary:
                share_id = save_trip(request, itinerary)
                if share_id:
                    itinerary["meta"]["share_id"] = share_id
                yield json.dumps({"type": "result", "itinerary": itinerary}) + "\n"
            else:
                yield json.dumps({"type": "error", "detail": itinerary or "no itinerary produced"}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "detail": str(e)}) + "\n"

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/trip/{share_id}")
def get_saved_trip(share_id: str):
    """Load a saved itinerary by its share id (for the shareable /trip/[id] page)."""
    itinerary = get_trip(share_id)
    if itinerary is None:
        raise HTTPException(status_code=404, detail="trip not found")
    return itinerary
