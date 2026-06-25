# Roamio Backlog — Parked Problems & Future Ideas

Known limitations we've *consciously* deferred, with candidate approaches recorded
so the thinking isn't lost. Distinct from DECISIONS.md (which logs choices we've
made); this is the "not yet" list.

---

## Start-city routing — generalize beyond the curated hub table
**Status:** Partially solved (v0). Deferred — revisit when non-hub / unknown start
cities become a real user need.

**What works now (v0):** `origin_hubs.json` + the sum-model give accurate drive
times for cities SOUTH of the Islamabad hub that are in the table. Northern-corridor
origins are flagged as upper bounds (see DECISIONS #006).

**Two open gaps:**
1. **Unknown cities** (e.g. Lala Musa) — not in the table at all, so currently rejected.
2. **Tree geography** — northern origins over-estimate, because Northern Pakistan
   branches (KKH / Kaghan / Swat spurs) and a single hub-distance can't model that.

**Candidate approaches (complementary — could combine):**
- **A. Self-built road graph/tree.** Nodes = cities + destinations; edges = drive
  times between *adjacent* points. Handles the branches properly. Pure curated static
  data, no API. Cost: gathering the edge data. → fixes the *model*.
- **B. Web-search-on-miss + cache (self-populating table).** If a start city isn't in
  `origin_hubs.json`, use a web search (Tavily — already planned for Week 3) to fetch
  just its first leg **to the Islamabad hub** (one search, reuses existing
  hub→destination data), then write it back to `origin_hubs.json` for future reuse.
  External dependency only on a cache miss; amortizes to ~zero. → fixes *missing data*.

**Why deferred:** v0 targets southern-city travellers, where the current model is
accurate. The fix is real work that doesn't teach RAG/agents (the month's goal).

---

## Post-v0 Roadmap (agreed 2026-06-25, executing in order)

Prioritised by dependencies + value. LangGraph first because everything else plugs
into it.

**Phase 0 · Stabilize what's live**
- [ ] Confirm deployed app works end-to-end after the CORS fix (trip generates on Vercel)
- [ ] If backend hits the 512 MB free-tier limit: slim `chromadb` → in-memory cosine search

**Phase 1 · LangGraph backbone** ⭐ (the agent refactor — IN PROGRESS)
- [ ] Convert the 4 tools + writer into LangGraph nodes (search → plan → write)
- [ ] Conditional re-plan edge (feasibility → replan → plan, else → write)
- [ ] Point `generate_itinerary()` at the compiled graph (same output)
- Unlocks: streaming, memory, the web_search node, the interview story

**Phase 2 · Live conditions via Tavily** ⭐
- [ ] `web_search` node: after route is built, query live weather / road blockages /
      pass status for the stops + passes + travel month
- [ ] Surface as itinerary warnings; optionally feed feasibility (closed pass → flag)
- `TAVILY_API_KEY` already set on Render.

**Phase 3 · Streaming progress**
- [ ] Stream graph nodes to the UI ("Searching… Building route… Checking conditions… Writing…")
- Depends on Phase 1.

**Phase 4 · Memory + real sharing** (growth engine)
- [ ] Supabase `trips` table + `save_trip()` → returns `share_id`
- [ ] Frontend real routes (`/`, `/plan`, `/trip/[id]`); `/trip/[id]` loads saved trip
- [ ] Real "Copy Share Link"; also fixes reload-loses-trip

**Phase 5 · Data depth**
- [ ] Expand corpus 5 → 15 (`extract_destination` + verify). Can run in parallel.

**Phase 6 · Polish & ship-proof**
- [ ] "Remove Skardu"-style stop-exclusion tweaks
- [ ] Log the activity-grounding decision (DECISIONS.md)
- [ ] Real README + 90-sec demo video
