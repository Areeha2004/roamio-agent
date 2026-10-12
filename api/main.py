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
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "agent"))
sys.path.insert(0, str(ROOT / "db"))
from orchestrator import generate_itinerary, graph  # noqa: E402
from tweak import interpret_tweak  # noqa: E402
from store import save_trip, get_trip  # noqa: E402
from api.telemetry import UsageTracker, itinerary_fields, log_event  # noqa: E402

app = FastAPI(title="Roamio API", version="0.1.0")

# CORS origins: defaults to local dev; in production set ALLOWED_ORIGINS to your
# Vercel URL (comma-separated for multiple), e.g. "https://roamio.vercel.app".
_DEFAULT_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
]
# Trailing slashes are stripped: browsers send Origin without one, so "https://x.app/" in the
# env var would silently match nothing — the API keeps working from curl while every browser
# call fails CORS. Be forgiving about the config instead.
_env_origins = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_env_origins or _DEFAULT_ORIGINS,
    # Also allow any localhost / private-LAN origin in dev, so a phone on the same Wi-Fi
    # hitting http://<LAN-IP>:3000 can reach the API. Never matches public hosts.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_log(request: Request, call_next):
    """One structured log line per request, tagged with a request id that is also returned
    in the X-Request-ID header — so a user-reported failure can be found in the logs.
    For the streaming endpoint this times the response *start*; the full generation is
    logged separately as an "itinerary" event."""
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        log_event("request", request_id=request_id, method=request.method,
                  path=request.url.path, status=status,
                  latency_ms=round((time.perf_counter() - start) * 1000))


class PlanRequest(BaseModel):
    """Mirrors the frontend PlanForm (camelCase) so the UI posts as-is."""
    days: int = Field(ge=1, le=30)
    budget: int = Field(ge=0)            # PKR
    startCity: str
    groupType: str                       # Solo | Couple | Friends | Family
    vibe: str                            # primary vibe (drives the title)
    month: int = Field(ge=1, le=12)
    stayStyle: str = "standard"          # budget | standard | luxury (optional)
    transport: str = "car"               # car (private) | local (public/bus)
    focus: str = ""                      # corpus id to build the trip around (featured pick)
    interests: list[str] = []            # extra vibes/goals that enrich the search
    exclude: list[str] = []              # destination names/ids to avoid ("somewhere else")


class TweakRequest(BaseModel):
    """A free-text 'tweak this trip' request plus the current plan context."""
    tweak: str
    days: int = 5
    budget_pkr: int = 75000
    vibe: str = ""
    interests: list[str] = []
    transport: str = "car"
    style: str = "standard"
    month: int = 7
    destinations: list[str] = []   # current destination names, for context
    has_focus: bool = False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/interpret-tweak")
def interpret_tweak_endpoint(req: TweakRequest):
    """Parse a free-text tweak into structured edit ops. Returns {ok:false} on failure so the
    frontend can fall back to its legacy regex handler — a tweak never hard-fails."""
    ops = interpret_tweak(req.model_dump(), req.tweak)
    return {"ok": False} if ops is None else {"ok": True, "ops": ops}


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
        "transport": (req.transport or "car").lower(),
        "prefer": (req.focus or "").strip() or None,
        "interests": [i.strip() for i in (req.interests or [])],
        "exclude": [e.strip() for e in (req.exclude or [])],
    }


@app.post("/generate-itinerary")
def generate(req: PlanRequest, http: Request):
    """Non-streaming: returns the full itinerary in one response.
    Nothing is persisted here — a trip is only saved when the user shares it (POST /share)."""
    request = _to_request(req)
    usage, start = UsageTracker(), time.perf_counter()
    try:
        result = generate_itinerary(request, config={"callbacks": [usage]})
    except Exception as e:  # surface unexpected failures as 500s, not silent hangs
        log_event("itinerary", request_id=http.state.request_id, outcome="error", error=str(e),
                  total_ms=round((time.perf_counter() - start) * 1000), **usage.as_dict())
        raise HTTPException(status_code=500, detail=f"itinerary generation failed: {e}")
    log_event("itinerary", request_id=http.state.request_id,
              total_ms=round((time.perf_counter() - start) * 1000),
              **usage.as_dict(), **itinerary_fields(result))
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result)  # e.g. unsupported start city
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
def generate_stream(req: PlanRequest, http: Request):
    """Stream graph progress as newline-delimited JSON, then the final itinerary.
    Events: {"type":"progress","label":...} per node, then {"type":"result","itinerary":...}."""
    request = _to_request(req)
    request_id = http.state.request_id

    def gen():
        itinerary = None
        usage, start = UsageTracker(), time.perf_counter()
        node_ms, replans, error = {}, 0, None  # time per node, summed across re-plan loops
        last = start
        try:
            for chunk in graph.stream({"request": request}, stream_mode="updates",
                                      config={"callbacks": [usage]}):
                now = time.perf_counter()
                elapsed, last = round((now - last) * 1000), now
                for node, update in chunk.items():
                    node_ms[node] = node_ms.get(node, 0) + elapsed
                    replans += node == "replan"
                    yield json.dumps({"type": "progress", "node": node,
                                      "label": _NODE_LABELS.get(node, "Working…")}) + "\n"
                    if isinstance(update, dict) and update.get("itinerary") is not None:
                        itinerary = update["itinerary"]
            if itinerary and "error" not in itinerary:
                # Not persisted on generation — only when the user shares it (POST /share).
                yield json.dumps({"type": "result", "itinerary": itinerary}) + "\n"
            else:
                yield json.dumps({"type": "error", "detail": itinerary or "no itinerary produced"}) + "\n"
        except Exception as e:
            error = str(e)
            yield json.dumps({"type": "error", "detail": str(e)}) + "\n"
        finally:
            fields = itinerary_fields(itinerary) if error is None else {"outcome": "error", "error": error}
            log_event("itinerary", request_id=request_id,
                      total_ms=round((time.perf_counter() - start) * 1000),
                      node_ms=node_ms, replans=replans, **usage.as_dict(), **fields)

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/share")
def share_trip(itinerary: dict):
    """Persist a trip ON DEMAND (when the user hits Share / Copy link) and return its
    share id. Saving only here — not on generation — keeps the DB free of trips nobody
    chose to keep. Returns 503 if sharing isn't configured (no Supabase)."""
    if not isinstance(itinerary, dict) or "summary" not in itinerary:
        raise HTTPException(status_code=400, detail="invalid itinerary payload")
    if itinerary.get("meta", {}).get("share_id"):
        return {"share_id": itinerary["meta"]["share_id"]}  # already shared — reuse the id
    share_id = save_trip(itinerary.get("request", {}), itinerary)
    if not share_id:
        raise HTTPException(status_code=503, detail="sharing is not available right now")
    return {"share_id": share_id}


@app.get("/trip/{share_id}")
def get_saved_trip(share_id: str):
    """Load a saved itinerary by its share id (for the shareable /trip/[id] page)."""
    itinerary = get_trip(share_id)
    if itinerary is None:
        raise HTTPException(status_code=404, detail="trip not found")
    return itinerary
