"""
Roamio — evals harness (lean)
=============================
Two layers, deliberately:

1. DETERMINISTIC checks (default, instant, no LLM/$$) — assert the trustworthy math:
   feasibility (season / time / budget+buffer), cost ordering (local<car, luxury>budget,
   more days cost more), route sanity. This is the real regression guard for the parts that
   are pure code.

2. E2E checks (`--e2e`, makes real LLM + web calls) — a small golden set run through the full
   pipeline to check the LLM-driven behaviour: focus honoured, exclude works, theme matching,
   day count, and the system's own faithfulness {checked, verified}. We read the guard's output
   rather than judging again — no second judge to calibrate.

Run:  ./venv/Scripts/python.exe evals/run.py            # deterministic only (fast, free)
      ./venv/Scripts/python.exe evals/run.py --e2e      # + full-pipeline cases (LLM cost)
      ./venv/Scripts/python.exe evals/run.py --e2e --limit 2
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "agent"))

from planning import build_route, estimate_cost, check_feasibility, BUDGET_BUFFER_PKR

_corpus = {d["id"]: d for d in json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))}


class Score:
    def __init__(self):
        self.rows = []

    def check(self, name, ok, detail=""):
        self.rows.append((name, bool(ok), "" if ok else str(detail)))

    def report(self):
        passed = sum(1 for _, ok, _ in self.rows if ok)
        total = len(self.rows)
        print("\n" + "=" * 72)
        print(f"  ROAMIO EVALS  —  {passed}/{total} passed")
        print("=" * 72)
        for name, ok, detail in self.rows:
            mark = "PASS" if ok else "FAIL"
            line = f"  [{mark}] {name}"
            if not ok and detail:
                line += f"   -> {detail}"
            print(line)
        print("=" * 72)
        return passed == total


# ---------------------------------------------------------------------------
# 1) DETERMINISTIC — pure planning math, no LLM
# ---------------------------------------------------------------------------
def deterministic_checks(score):
    # Season gating
    r = build_route(["skardu"], "Islamabad")
    c = estimate_cost(r, "couple", 6)
    f = check_feasibility(r, c, 300000, 6, 1)
    score.check("Skardu in January is out-of-season & infeasible",
                bool(f["season"]["out_of_season"]) and not f["feasible"])

    r = build_route(["hunza-valley"], "Islamabad")
    c = estimate_cost(r, "couple", 6)
    f = check_feasibility(r, c, 300000, 6, 7)
    score.check("Hunza in July is in-season & feasible", f["feasible"], f["problems"])

    # Time gating
    r = build_route(["skardu"], "Islamabad")
    c = estimate_cost(r, "couple", 2)
    f = check_feasibility(r, c, 300000, 2, 7)
    score.check("Skardu in 2 days is time-infeasible", not f["time"]["ok"] and not f["feasible"])

    # Budget tiers + buffer
    r = build_route(["skardu"], "Islamabad")
    c = estimate_cost(r, "couple", 6)
    total = c["total_pkr"]
    f = check_feasibility(r, c, total - (BUDGET_BUFFER_PKR + 35000), 6, 7)
    score.check("Far-under budget is over_budget & infeasible",
                f["budget"]["status"] == "over_budget" and not f["feasible"])
    f = check_feasibility(r, c, total - (BUDGET_BUFFER_PKR - 10000), 6, 7)
    score.check("Just over budget (within buffer) is slightly_over & still feasible",
                f["budget"]["status"] == "slightly_over" and f["feasible"])
    f = check_feasibility(r, c, total + 60000, 6, 7)
    score.check("Ample budget is comfortable", f["budget"]["status"] == "comfortable")

    # Cost ordering
    car = estimate_cost(r, "couple", 6, "standard", "car")
    loc = estimate_cost(r, "couple", 6, "standard", "local")
    score.check("Local transport is cheaper than a private car",
                loc["total_pkr"] < car["total_pkr"],
                f"local {loc['total_pkr']} vs car {car['total_pkr']}")
    bud = estimate_cost(r, "couple", 6, "budget", "car")
    lux = estimate_cost(r, "couple", 6, "luxury", "car")
    score.check("Luxury stay costs more than budget stay", lux["total_pkr"] > bud["total_pkr"])
    c4 = estimate_cost(r, "couple", 4)
    c8 = estimate_cost(r, "couple", 8)
    score.check("More days cost more", c8["total_pkr"] > c4["total_pkr"])

    # Route sanity
    score.check("Route round-trip hours are positive", r["est_round_trip_drive_hours"] > 0)


# ---------------------------------------------------------------------------
# 2) E2E — full pipeline (LLM + web). Golden set with targeted expectations.
# ---------------------------------------------------------------------------
def _base(**kw):
    r = {"days": 5, "budget_pkr": 200000, "start_city": "Islamabad", "group_type": "couple",
         "vibe": "adventure", "interests": [], "month": 7, "transport": "car",
         "style": "standard", "prefer": None, "exclude": []}
    r.update(kw)
    return r


E2E = [
    {"name": "Focus is honoured (Fairy Meadows)",
     "req": _base(prefer="fairy-meadows", days=4, month=7), "expect": {"has": "fairy-meadows"}},
    {"name": "Exclude keeps Naran out",
     "req": _base(vibe="Chill", days=3, month=7, exclude=["Naran & Kaghan Valley"]),
     "expect": {"not_has": "naran-kaghan"}},
    {"name": "Culture/heritage theme surfaces a cultural place",
     "req": _base(vibe="Heritage", interests=["culture", "heritage"], days=4, month=7),
     "expect": {"theme_any": ["culture", "heritage"]}},
    {"name": "Lakes interest surfaces a lakes place",
     "req": _base(vibe="Adventure", interests=["lakes"], days=5, month=7),
     "expect": {"theme_any": ["lakes"]}},
    {"name": "Faithfulness guard runs & verifies most days",
     "req": _base(prefer="hunza-valley", days=6, month=7),
     "expect": {"faithfulness_min_ratio": 0.5}},
]


def e2e_checks(score, limit=None):
    from orchestrator import generate_itinerary
    cases = E2E[:limit] if limit else E2E
    for case in cases:
        name, req, exp = case["name"], case["req"], case["expect"]
        try:
            it = generate_itinerary(req)
        except Exception as e:
            score.check(f"[E2E] {name} — runs", False, repr(e))
            continue
        if not isinstance(it, dict) or "summary" not in it:
            score.check(f"[E2E] {name} — runs", False, f"bad result: {it}")
            continue

        s = it["summary"]
        dests = s.get("destinations", [])
        score.check(f"[E2E] {name} — day count == {req['days']}", len(it["days"]) == req["days"],
                    f"got {len(it['days'])}")

        if "has" in exp:
            score.check(f"[E2E] {name} — includes {exp['has']}", exp["has"] in dests, f"got {dests}")
        if "not_has" in exp:
            score.check(f"[E2E] {name} — excludes {exp['not_has']}", exp["not_has"] not in dests, f"got {dests}")
        if "feasible" in exp:
            score.check(f"[E2E] {name} — feasible == {exp['feasible']}", s.get("feasible") == exp["feasible"])
        if "theme_any" in exp:
            tags = set()
            for did in dests:
                tags |= {t.lower() for t in _corpus.get(did, {}).get("tags", [])}
            score.check(f"[E2E] {name} — theme matches {exp['theme_any']}",
                        any(t in tags for t in exp["theme_any"]), f"tags {sorted(tags)}")
        if "faithfulness_min_ratio" in exp:
            fa = s.get("faithfulness", {}) or {}
            chk, ver = fa.get("checked", 0), fa.get("verified", 0)
            ratio = ver / chk if chk else 0.0
            score.check(f"[E2E] {name} — faithfulness ratio >= {exp['faithfulness_min_ratio']}",
                        chk > 0 and ratio >= exp["faithfulness_min_ratio"], f"{ver}/{chk}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Roamio evals")
    ap.add_argument("--e2e", action="store_true", help="also run full-pipeline cases (real LLM + web calls)")
    ap.add_argument("--limit", type=int, default=None, help="run only the first N e2e cases")
    args = ap.parse_args()

    score = Score()
    deterministic_checks(score)
    if args.e2e:
        print("Running E2E cases through the full pipeline (real LLM + web calls)…")
        e2e_checks(score, args.limit)
    ok = score.report()
    sys.exit(0 if ok else 1)
