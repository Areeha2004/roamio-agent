"""HTTP layer — health and request validation. No endpoint here reaches the LLM:
invalid bodies are rejected by Pydantic before the handler runs."""

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

VALID = {"days": 5, "budget": 150000, "startCity": "Islamabad", "groupType": "Couple",
         "vibe": "Adventure", "month": 7}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.parametrize("field, value", [
    ("days", 0),       # at least one day
    ("days", 31),      # at most 30
    ("budget", -1),    # no negative budgets
    ("month", 13),     # 1–12
])
def test_generate_rejects_out_of_range_values(field, value):
    r = client.post("/generate-itinerary", json={**VALID, field: value})
    assert r.status_code == 422


def test_generate_rejects_missing_required_field():
    body = {k: v for k, v in VALID.items() if k != "startCity"}
    r = client.post("/generate-itinerary", json=body)
    assert r.status_code == 422


def test_allowed_origins_tolerates_a_trailing_slash(monkeypatch):
    """A browser sends Origin without a trailing slash. If the env var has one and we don't
    strip it, every browser call fails CORS while curl keeps working — found in production
    on 13 Oct 2026."""
    import importlib

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://roamioagent.vercel.app/, https://other.app")
    main = importlib.reload(importlib.import_module("api.main"))
    try:
        assert main._env_origins == ["https://roamioagent.vercel.app", "https://other.app"]

        r = TestClient(main.app).options(
            "/generate-itinerary",
            headers={"Origin": "https://roamioagent.vercel.app",
                     "Access-Control-Request-Method": "POST"},
        )
        assert r.headers.get("access-control-allow-origin") == "https://roamioagent.vercel.app"
    finally:
        monkeypatch.delenv("ALLOWED_ORIGINS")
        importlib.reload(main)  # restore module state for the other tests
