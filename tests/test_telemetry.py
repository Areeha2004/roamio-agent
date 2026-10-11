"""Structured logging and usage tracking — no LLM calls."""

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

import api.main
from api.telemetry import PRICE_PER_M_INPUT, PRICE_PER_M_OUTPUT, UsageTracker, itinerary_fields


def _llm_result(input_tokens, output_tokens):
    msg = AIMessage(content="x", usage_metadata={"input_tokens": input_tokens,
                                                 "output_tokens": output_tokens,
                                                 "total_tokens": input_tokens + output_tokens})
    return LLMResult(generations=[[ChatGeneration(message=msg)]])


def test_usage_tracker_sums_calls_tokens_and_cost():
    t = UsageTracker()
    t.on_llm_end(_llm_result(1000, 200))
    t.on_llm_end(_llm_result(3000, 800))
    assert (t.llm_calls, t.input_tokens, t.output_tokens) == (2, 4000, 1000)
    expected = 4000 / 1e6 * PRICE_PER_M_INPUT + 1000 / 1e6 * PRICE_PER_M_OUTPUT
    assert t.cost_usd == round(expected, 6)


def test_usage_tracker_falls_back_to_openai_token_usage():
    t = UsageTracker()
    t.on_llm_end(LLMResult(generations=[[]],
                           llm_output={"token_usage": {"prompt_tokens": 50, "completion_tokens": 7}}))
    assert (t.input_tokens, t.output_tokens) == (50, 7)


def test_itinerary_fields_marks_missing_summary_as_error():
    assert itinerary_fields(None) == {"outcome": "error"}
    ok = itinerary_fields({"summary": {"feasible": True, "destinations": ["hunza-valley"],
                                       "faithfulness": {"checked": 6, "verified": 5}}})
    assert ok["outcome"] == "ok" and ok["faithfulness_verified"] == 5


def test_every_request_is_logged_with_an_id(monkeypatch):
    events = []
    monkeypatch.setattr(api.main, "log_event", lambda event, **f: events.append((event, f)))
    r = TestClient(api.main.app).get("/health")

    request_id = r.headers["X-Request-ID"]
    assert request_id
    event, fields = events[-1]
    assert event == "request"
    assert fields["request_id"] == request_id
    assert fields["path"] == "/health" and fields["status"] == 200
    assert fields["latency_ms"] >= 0


def test_incoming_request_id_is_reused(monkeypatch):
    monkeypatch.setattr(api.main, "log_event", lambda *a, **k: None)
    r = TestClient(api.main.app).get("/health", headers={"X-Request-ID": "trace-123"})
    assert r.headers["X-Request-ID"] == "trace-123"
