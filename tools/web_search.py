"""
Roamio — web_search (Tavily)
============================
Live web search for time-sensitive travel info (road conditions, weather, pass
status) — the freshness layer over the static corpus. Used by the orchestrator's
'conditions' node (Phase 2).

Resilient by design: any failure (no key, rate limit, network) returns [] so a
trip still plans fine without live data.

Test:  ./venv/Scripts/python.exe tools/web_search.py
"""

import os
from dotenv import load_dotenv

load_dotenv()

try:
    from tavily import TavilyClient
    _key = os.getenv("TAVILY_API_KEY")
    _client = TavilyClient(api_key=_key) if _key else None
except Exception:
    _client = None


def web_search(query, max_results=3):
    """Return [{title, content, url}] for a query, or [] on any failure."""
    if _client is None:
        return []
    try:
        res = _client.search(query=query, max_results=max_results, search_depth="basic")
        return [
            {"title": r.get("title", ""), "content": r.get("content", ""), "url": r.get("url", "")}
            for r in res.get("results", [])
        ]
    except Exception:
        return []


if __name__ == "__main__":
    print("web_search('current road conditions Hunza highway Pakistan'):\n")
    results = web_search("current road conditions Hunza highway Pakistan", max_results=3)
    if not results:
        print("  (no results — check TAVILY_API_KEY)")
    for r in results:
        print("-", r["title"])
        print(" ", r["content"][:160].replace("\n", " "), "...")
        print(" ", r["url"], "\n")
