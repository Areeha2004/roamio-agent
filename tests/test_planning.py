"""The trustworthy math — route, cost, feasibility. Pure Python, no LLM.

Ported from the deterministic layer of evals/run.py.
"""

import pytest

from planning import BUDGET_BUFFER_PKR, build_route, check_feasibility, estimate_cost


@pytest.fixture
def skardu():
    return build_route(["skardu"], "Islamabad")


# ── Season ────────────────────────────────────────────────────────────────────
def test_skardu_in_january_is_out_of_season_and_infeasible(skardu):
    cost = estimate_cost(skardu, "couple", 6)
    f = check_feasibility(skardu, cost, 300000, 6, 1)
    assert f["season"]["out_of_season"]
    assert not f["feasible"]


def test_hunza_in_july_is_feasible():
    route = build_route(["hunza-valley"], "Islamabad")
    cost = estimate_cost(route, "couple", 6)
    f = check_feasibility(route, cost, 300000, 6, 7)
    assert f["feasible"], f["problems"]


# ── Time ──────────────────────────────────────────────────────────────────────
def test_skardu_in_two_days_is_time_infeasible(skardu):
    cost = estimate_cost(skardu, "couple", 2)
    f = check_feasibility(skardu, cost, 300000, 2, 7)
    assert not f["time"]["ok"]
    assert not f["feasible"]


# ── Budget tiers + buffer ─────────────────────────────────────────────────────
def test_far_under_budget_is_over_budget_and_infeasible(skardu):
    cost = estimate_cost(skardu, "couple", 6)
    f = check_feasibility(skardu, cost, cost["total_pkr"] - (BUDGET_BUFFER_PKR + 35000), 6, 7)
    assert f["budget"]["status"] == "over_budget"
    assert not f["feasible"]


def test_just_over_budget_within_buffer_is_slightly_over_but_feasible(skardu):
    cost = estimate_cost(skardu, "couple", 6)
    f = check_feasibility(skardu, cost, cost["total_pkr"] - (BUDGET_BUFFER_PKR - 10000), 6, 7)
    assert f["budget"]["status"] == "slightly_over"
    assert f["feasible"]


def test_ample_budget_is_comfortable(skardu):
    cost = estimate_cost(skardu, "couple", 6)
    f = check_feasibility(skardu, cost, cost["total_pkr"] + 60000, 6, 7)
    assert f["budget"]["status"] == "comfortable"


# ── Cost ordering ─────────────────────────────────────────────────────────────
def test_local_transport_is_cheaper_than_private_car(skardu):
    car = estimate_cost(skardu, "couple", 6, "standard", "car")
    local = estimate_cost(skardu, "couple", 6, "standard", "local")
    assert local["total_pkr"] < car["total_pkr"]


def test_luxury_stay_costs_more_than_budget_stay(skardu):
    budget = estimate_cost(skardu, "couple", 6, "budget", "car")
    luxury = estimate_cost(skardu, "couple", 6, "luxury", "car")
    assert luxury["total_pkr"] > budget["total_pkr"]


def test_more_days_cost_more(skardu):
    assert estimate_cost(skardu, "couple", 8)["total_pkr"] > estimate_cost(skardu, "couple", 4)["total_pkr"]


# ── Route ─────────────────────────────────────────────────────────────────────
def test_route_round_trip_hours_are_positive(skardu):
    assert skardu["est_round_trip_drive_hours"] > 0
