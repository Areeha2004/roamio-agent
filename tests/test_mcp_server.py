"""The MCP tool surface. Calls the tool functions directly — no transport, no LLM.

Only the deterministic tools are covered here; search_destinations needs real embeddings
and is exercised by the opt-in E2E eval instead.
"""

import pytest

mcp_server = pytest.importorskip("mcp_server.server", reason="MCP SDK not installed")

# In mcp 2.x the @tool() decorator returns the plain function, so these are callable as-is.
build_route = mcp_server.build_route
get_destination = mcp_server.get_destination
list_origin_cities = mcp_server.list_origin_cities
plan_trip = mcp_server.plan_trip


# ── Discovery ────────────────────────────────────────────────────────────────
def test_origin_cities_are_listed_nearest_first():
    out = list_origin_cities()
    assert out["count"] == len(out["cities"]) > 0
    hours = [c["hours_to_hub"] for c in out["cities"]]
    assert hours == sorted(hours)
    assert {"Islamabad", "Lahore", "Karachi"} <= {c["city"] for c in out["cities"]}


def test_northern_cities_are_marked_as_such():
    """Their drive estimates are upper bounds — a caller has to be able to tell."""
    sides = {c["city"]: c["side"] for c in list_origin_cities()["cities"]}
    assert sides["Gilgit"] == "north"
    assert sides["Lahore"] == "south"


# ── Detail lookup ────────────────────────────────────────────────────────────
def test_get_destination_returns_the_planning_fields():
    d = get_destination("hunza-valley")
    assert d["name"] == "Hunza Valley"
    for field in ("open_months", "cost_ranges_pkr", "permits", "recommended_trip_days"):
        assert field in d


def test_unknown_destination_lists_the_valid_ids():
    """An error that tells the caller how to recover beats a bare failure."""
    out = get_destination("paris")
    assert "error" in out
    assert "hunza-valley" in out["known_ids"]


# ── Routing ──────────────────────────────────────────────────────────────────
def test_route_composes_both_legs_through_the_hub():
    direct = build_route(["hunza-valley"], "Islamabad")
    via_lahore = build_route(["hunza-valley"], "Lahore")
    assert via_lahore["round_trip_drive_hours"] > direct["round_trip_drive_hours"]


def test_northern_origin_route_is_flagged_as_an_upper_bound():
    route = build_route(["hunza-valley"], "Gilgit")
    assert any("UPPER BOUND" in w for w in route["warnings"])


def test_unsupported_start_city_errors_with_the_supported_list():
    out = build_route(["hunza-valley"], "Tokyo")
    assert "error" in out
    assert "islamabad" in out["supported_origins"]


# ── The composed planner ─────────────────────────────────────────────────────
def test_a_reasonable_trip_is_feasible():
    out = plan_trip(["hunza-valley"], days=8, budget_pkr=400000, month=7)
    assert out["feasible"] is True
    assert out["cost_pkr"]["total"] > 0
    assert set(out["cost_pkr"]["breakdown"]) == {
        "hotels", "food", "local_transport", "intercity_transport"}


def test_out_of_season_trip_reports_the_season_problem():
    out = plan_trip(["skardu"], days=8, budget_pkr=400000, month=1)
    assert out["feasible"] is False
    assert out["verdict"]["season"]["out_of_season"] == ["Skardu"]
    assert any("closed in January" in p for p in out["problems"])


def test_too_few_days_reports_the_time_problem():
    out = plan_trip(["skardu"], days=2, budget_pkr=400000, month=7)
    assert out["feasible"] is False
    assert out["verdict"]["time"]["ok"] is False


def test_over_budget_trip_is_infeasible_and_suggests_a_fix():
    out = plan_trip(["skardu"], days=8, budget_pkr=20000, month=7)
    assert out["feasible"] is False
    assert out["verdict"]["budget"]["status"] == "over_budget"
    assert out["suggestions"]


def test_slightly_over_budget_stays_feasible():
    """The 25k buffer: a near-miss on a well-matched trip is offered, not rejected."""
    priced = plan_trip(["hunza-valley"], days=8, budget_pkr=400000, month=7)
    total = priced["cost_pkr"]["total"]
    out = plan_trip(["hunza-valley"], days=8, budget_pkr=total - 10000, month=7)
    assert out["verdict"]["budget"]["status"] == "slightly_over"
    assert out["feasible"] is True


def test_local_transport_is_offered_as_a_cheaper_option():
    out = plan_trip(["hunza-valley"], days=8, budget_pkr=400000, month=7)
    options = out["cost_pkr"]["transport_options"]
    assert options["local"]["cost"] < options["car"]["cost"]
    assert options["local"]["round_trip_hours"] > options["car"]["round_trip_hours"]
