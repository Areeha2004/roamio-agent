"""The agent's control flow — the conditional edge and the re-plan step.

Both are plain Python over the graph state, so they're tested directly, without
running the LLM nodes (conditions, write).
"""

from orchestrator import MAX_REPLANS, decide, plan_node, replan_node


def make_state(stops, pool=(), **request):
    req = {"days": 6, "budget_pkr": 300000, "start_city": "Islamabad", "group_type": "couple",
           "vibe": "adventure", "interests": [], "month": 7, "style": "standard", "prefer": None}
    req.update(request)
    state = {"request": req, "stops": list(stops), "pool": list(pool), "transport": "car",
             "replan_count": 0, "replan_notes": []}
    state.update(plan_node(state))
    return state


# ── decide(): the conditional edge ────────────────────────────────────────────
def test_feasible_plan_moves_on_to_conditions():
    assert decide({"feasibility": {"feasible": True}, "replan_count": 0}) == "conditions"


def test_infeasible_plan_triggers_replan():
    assert decide({"feasibility": {"feasible": False}, "replan_count": 0}) == "replan"


def test_replan_loop_stops_at_max_replans():
    """Best-effort exit: the loop must terminate even if the plan never becomes feasible."""
    assert decide({"feasibility": {"feasible": False}, "replan_count": MAX_REPLANS}) == "conditions"


# ── replan_node(): what the re-plan actually changes ──────────────────────────
def test_replan_drops_out_of_season_stop():
    state = make_state(["skardu"], month=1)
    out = replan_node(state)
    assert "skardu" not in out["stops"]
    assert "January" in out["replan_notes"][-1]
    assert out["replan_count"] == 1


def test_replan_swaps_over_budget_stop_for_cheaper_on_theme_one():
    # Naran (9h, adventure) qualifies; Murree is cheaper still but doesn't match the vibe.
    state = make_state(["skardu"], pool=["naran-kaghan", "murree-galiyat"], budget_pkr=10000)
    assert state["feasibility"]["budget"]["status"] == "over_budget"
    out = replan_node(state)
    assert out["stops"] == ["naran-kaghan"]


def test_replan_never_swaps_the_users_chosen_destination():
    state = make_state(["skardu"], pool=["naran-kaghan"], budget_pkr=10000, prefer="skardu")
    out = replan_node(state)
    assert out["stops"] == ["skardu"]
    assert "over your budget" in out["replan_notes"][-1]
