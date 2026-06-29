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

The post-v0 plan (agreed 2026-06-25) is now **complete**:

- [x] **LangGraph backbone** — search → plan → (re-plan loop) → conditions → write
- [x] **Live conditions via Tavily** — surfaced as itinerary warnings
- [x] **Streaming progress** — NDJSON, node-by-node to the UI
- [x] **Memory + real sharing** — Supabase `save_trip`/`get_trip`, **save-on-share** → `share_id`, `/trip/[id]`
- [x] **Data depth** — corpus expanded to **15** destinations
- [x] **RAG-grounded, cited writer** (DECISIONS #012) + **faithfulness guard** (#013)
- [x] **Natural-language tweaking** (#014, replaces the old regex stop-exclusion) + **lean evals** (#015)
- [x] **README / docs** brought in line with the shipped system

---

## Deferred to the next version

- **Multi-hub / road-tree routing** — the big one (see the routing section above). Unlocks
  **non-northern destinations** (Lahore, Punjab) and accurate **AJK-internal origins**. v1 is
  northern-only on purpose, because the single hub is correct there.
- **Conversational planner** — a chat-first front door (NL → structured `PlanRequest` via
  tool-calling, with follow-up questions) as an alternative to the form.
- **Richer evals** — grow the golden set + add an LLM-judge rubric layer once the system is
  being actively iterated again (today's lean harness is enough for a frozen v1).
- **Free-tier hardening** — if the backend hits Render's 512 MB limit, slim `chromadb`
  → in-memory cosine search.
