"""
Roamio telemetry — structured logs + per-itinerary usage
========================================================
Every log line is one JSON object on stdout, so Render's log viewer (or any log tool)
can filter by request_id, endpoint or outcome instead of grepping prose.

    log_event("request", request_id=..., path=..., status=200, latency_ms=812)

UsageTracker is a LangChain callback: pass it in the graph's config and it counts every
LLM call made by any node — calls, tokens and estimated cost.
"""

import json
import logging
import sys
import time

from langchain_core.callbacks import BaseCallbackHandler

# gpt-4o-mini list prices, USD per 1M tokens. Update if the model or pricing changes.
# Embedding calls (text-embedding-3-small, a few short queries per trip) aren't counted —
# they're a rounding error next to the writer.
PRICE_PER_M_INPUT = 0.15
PRICE_PER_M_OUTPUT = 0.60

logger = logging.getLogger("roamio")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log_event(event: str, **fields) -> None:
    """Emit one structured log line: {"ts":..., "event":..., **fields}."""
    logger.info(json.dumps({"ts": round(time.time(), 3), "event": event, **fields}, default=str))


class UsageTracker(BaseCallbackHandler):
    """Accumulates LLM calls, tokens and estimated cost across one itinerary."""

    def __init__(self):
        self.llm_calls = 0
        self.input_tokens = 0
        self.output_tokens = 0

    def on_llm_end(self, response, **kwargs):
        self.llm_calls += 1
        usage = None
        for gens in response.generations:
            for g in gens:
                msg = getattr(g, "message", None)
                if msg is not None and getattr(msg, "usage_metadata", None):
                    usage = msg.usage_metadata
        if usage:
            self.input_tokens += usage.get("input_tokens", 0)
            self.output_tokens += usage.get("output_tokens", 0)
        else:  # fallback: OpenAI's raw token_usage block
            tu = (response.llm_output or {}).get("token_usage", {})
            self.input_tokens += tu.get("prompt_tokens", 0)
            self.output_tokens += tu.get("completion_tokens", 0)

    @property
    def cost_usd(self) -> float:
        return round(self.input_tokens / 1e6 * PRICE_PER_M_INPUT
                     + self.output_tokens / 1e6 * PRICE_PER_M_OUTPUT, 6)

    def as_dict(self) -> dict:
        return {"llm_calls": self.llm_calls, "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens, "cost_usd": self.cost_usd}


def itinerary_fields(itinerary) -> dict:
    """The outcome fields worth logging from a finished itinerary."""
    if not isinstance(itinerary, dict) or "summary" not in itinerary:
        return {"outcome": "error"}
    s = itinerary["summary"]
    fa = s.get("faithfulness") or {}
    return {"outcome": "ok", "feasible": s.get("feasible"),
            "destinations": s.get("destinations", []),
            "faithfulness_checked": fa.get("checked", 0),
            "faithfulness_verified": fa.get("verified", 0)}
