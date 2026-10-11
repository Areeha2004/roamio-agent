"""
Roamio — benchmark (real LLM + web calls, costs a few cents)
============================================================
Runs a fixed set of varied trip requests through the full graph and measures what a
production owner would ask about: latency (total and per node), LLM calls, tokens, cost,
re-plans, faithfulness, and failures. Writes evals/benchmark_results.json and prints a
summary block for the README.

Run:  ./venv/Scripts/python.exe evals/benchmark.py
      ./venv/Scripts/python.exe evals/benchmark.py --limit 2     # quick check
"""

import argparse
import json
import statistics
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "agent"))

from api.telemetry import UsageTracker, itinerary_fields  # noqa: E402
from orchestrator import graph  # noqa: E402


def _req(**kw):
    r = {"days": 5, "budget_pkr": 200000, "start_city": "Islamabad", "group_type": "couple",
         "vibe": "adventure", "interests": [], "month": 7, "transport": "car",
         "style": "standard", "prefer": None, "exclude": []}
    r.update(kw)
    return r


# Varied on purpose: short/long, cheap/luxury, in/out of season, other start cities,
# and a couple that should force the re-plan loop.
CASES = [
    _req(),
    _req(days=3, vibe="chill", group_type="family", budget_pkr=90000),
    _req(days=8, vibe="adventure", interests=["lakes", "trekking"], budget_pkr=450000),
    _req(prefer="hunza-valley", days=6, style="luxury", budget_pkr=600000),
    _req(vibe="heritage", interests=["culture", "heritage"], days=6, month=9),
    _req(start_city="Lahore", days=5, vibe="scenic", group_type="friends"),
    _req(start_city="Karachi", days=7, vibe="adventure", budget_pkr=350000),
    _req(days=4, budget_pkr=40000, transport="local", vibe="chill"),         # tight budget
    _req(days=5, month=1, vibe="adventure", budget_pkr=200000),               # winter
    _req(prefer="skardu", days=2, budget_pkr=300000),                         # too rushed
]


def run_case(req):
    usage, start = UsageTracker(), time.perf_counter()
    node_ms, replans, last, itinerary, error = {}, 0, start, None, None
    try:
        for chunk in graph.stream({"request": req}, stream_mode="updates",
                                  config={"callbacks": [usage]}):
            now = time.perf_counter()
            elapsed, last = round((now - last) * 1000), now
            for node, update in chunk.items():
                node_ms[node] = node_ms.get(node, 0) + elapsed
                replans += node == "replan"
                if isinstance(update, dict) and update.get("itinerary") is not None:
                    itinerary = update["itinerary"]
    except Exception as e:
        error = repr(e)
    fields = itinerary_fields(itinerary) if error is None else {"outcome": "error", "error": error}
    if fields["outcome"] == "ok" and "error" in itinerary:
        fields = {"outcome": "error", "error": itinerary["error"]}
    return {"request": req, "total_ms": round((time.perf_counter() - start) * 1000),
            "node_ms": node_ms, "replans": replans, **usage.as_dict(), **fields}


def summarize(runs):
    ok = [r for r in runs if r["outcome"] == "ok"]
    lat = sorted(r["total_ms"] for r in ok)
    checked = sum(r["faithfulness_checked"] for r in ok)
    verified = sum(r["faithfulness_verified"] for r in ok)
    nodes = {}
    for r in ok:
        for n, ms in r["node_ms"].items():
            nodes.setdefault(n, []).append(ms)
    return {
        "date": date.today().isoformat(),
        "runs": len(runs),
        "failures": len(runs) - len(ok),
        "median_latency_s": round(statistics.median(lat) / 1000, 1) if lat else None,
        "max_latency_s": round(lat[-1] / 1000, 1) if lat else None,
        "median_node_s": {n: round(statistics.median(v) / 1000, 1) for n, v in nodes.items()},
        "avg_llm_calls": round(statistics.mean(r["llm_calls"] for r in ok), 1) if ok else None,
        "avg_tokens": round(statistics.mean(r["input_tokens"] + r["output_tokens"] for r in ok)) if ok else None,
        "avg_cost_usd": round(statistics.mean(r["cost_usd"] for r in ok), 4) if ok else None,
        "runs_with_replan": sum(1 for r in ok if r["replans"]),
        "faithfulness": f"{verified}/{checked}" + (f" ({verified / checked:.0%})" if checked else ""),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Roamio benchmark (real API calls)")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    cases = CASES[:args.limit] if args.limit else CASES
    runs = []
    for i, req in enumerate(cases, 1):
        r = run_case(req)
        runs.append(r)
        print(f"[{i}/{len(cases)}] {r['outcome']:5}  {r['total_ms'] / 1000:5.1f}s  "
              f"${r['cost_usd']:.4f}  replans={r['replans']}  {r.get('destinations', r.get('error'))}")

    summary = summarize(runs)
    out = ROOT / "evals" / "benchmark_results.json"
    out.write_text(json.dumps({"summary": summary, "runs": runs}, indent=2), encoding="utf-8")
    print("\n" + json.dumps(summary, indent=2))
    print(f"\nWrote {out.relative_to(ROOT)}")
