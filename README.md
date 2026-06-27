# Roamio — AI trip planner for Northern Pakistan

> *"Tell it your days, budget and vibe — get a full day-by-day Pakistan trip plan in seconds."*

Roamio turns a few constraints (days, budget, start city, group, vibe, month) into a
grounded, day-by-day itinerary for Northern Pakistan: a sensible route, realistic costs,
seasonal feasibility, permit notes, live road/weather conditions, and a shareable link.

It's a **RAG + agent** system built on a curated travel corpus — not a ChatGPT wrapper.
The planning *decisions* are deterministic and grounded in real data; the LLM is fenced in
to do only what it's good at (writing natural language).

---

## The core idea: the LLM writes words, the code makes decisions

Every number and fact a user would *trust* — which destinations, the route, the cost, the
feasibility verdict — is produced by **deterministic Python over a curated corpus**. The LLM
never invents a price, a drive time, or a destination. This grounding is what makes the
output trustworthy, and it's the central design principle of the project.

| Part of a request | Powered by | LLM? |
|---|---|---|
| Which destinations to pick | semantic search (embeddings) **+ Python tag re-ranking** | embeddings only |
| Route & drive times | `build_route` — Python + a curated hub table | ❌ |
| Cost & budget breakdown | `estimate_cost` — Python arithmetic over cost ranges | ❌ |
| Feasibility & the re-plan loop | `check_feasibility` — Python (season/time/budget) | ❌ |
| Orchestration | a **LangGraph** state machine (flow coded by us) | ❌ |
| Live road/weather | **Tavily** web search, summarized by the LLM | summary only |
| The day-by-day prose | the **LLM** (`gpt-4o-mini`) writes titles & notes | ✅ |

---

## Architecture

The agent is a **LangGraph `StateGraph`** with a conditional **re-plan loop** — the thing that
makes it an *agent* and not a linear chain.

```
                 ┌──────────┐
   START ──────► │  search  │   RAG: embed query → retrieve → re-rank by tag match
                 └────┬─────┘
                      ▼
                 ┌──────────┐
            ┌──► │   plan   │   build_route → estimate_cost → check_feasibility
            │    └────┬─────┘
            │         │  decide()  ── not feasible? ──┐
            │         │                               ▼
            │         │                          ┌──────────┐
            └─────────┼──────────────────────────│  replan  │  drop a stop, try again
                      │  feasible                 └──────────┘
                      ▼
                 ┌────────────┐
                 │ conditions │   Tavily live road/weather, summarized
                 └────┬───────┘
                      ▼
                 ┌──────────┐
                 │  write   │   LLM writes the day-by-day itinerary (grounded)
                 └────┬─────┘
                      ▼
                     END  ──►  saved to Supabase, returned with a share_id
```

The full request flow:

```
Next.js form  →  FastAPI POST /generate-itinerary/stream  →  LangGraph agent
   → (streams progress: "Searching… Building route… Checking conditions… Writing…")
   → itinerary JSON  →  saved to Supabase  →  rendered in the UI  →  shareable /trip/[id]
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | **Next.js 16** + React 19 + Tailwind v4 (Figma-designed) |
| Backend | **FastAPI** (streaming NDJSON) |
| LLM | **gpt-4o-mini** via `langchain-openai` |
| Agent framework | **LangGraph** (`StateGraph` + conditional edge) |
| RAG | OpenAI `text-embedding-3-small` + **Chroma** (`langchain-chroma`) |
| Live search | **Tavily** (road/weather conditions) |
| Memory / sharing | **Supabase** (Postgres) |
| Hosting | **Vercel** (frontend) + **Render** (backend) |

---

## What's in the repo

```
corpus/           the moat — 15 curated destinations + schema, validator, origin-hub table
  corpus.json       15 Northern-Pakistan destinations (data + photos)
  SCHEMA.md         field definitions (one field = one job)
  validate_corpus.py  schema/validity guardrail
  origin_hubs.json  start-city → Islamabad-hub drive legs
  extract_destination.py  LLM tool to draft new destinations from raw text
rag/
  search.py         RAG: build/load the Chroma index, search_destinations()
tools/
  planning.py       build_route · estimate_cost · check_feasibility (deterministic)
  web_search.py     Tavily wrapper (graceful if unavailable)
agent/
  orchestrator.py   the LangGraph state machine (generate_itinerary)
  writer.py         the LLM itinerary writer (grounded prose)
db/
  store.py          Supabase save_trip / get_trip (graceful if unconfigured)
api/
  main.py           FastAPI: /generate-itinerary, /stream, /trip/{id}
frontend/           Next.js app (planner form + itinerary + shareable page)
DECISIONS.md        engineering decision log (the reasoning behind key choices)
BACKLOG.md          consciously deferred work + the post-v0 roadmap
ITINERARY_SCHEMA.md the backend ↔ frontend contract
```

---

## Run it locally

**Prerequisites:** Python 3.12 venv, Node 20+, pnpm, and a `.env` with `OPENAI_API_KEY`
(plus optional `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`).

**Backend** (terminal 1):
```bash
python -m venv venv
venv\Scripts\activate            # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python -m uvicorn api.main:app --reload --port 8000
```

**Frontend** (terminal 2):
```bash
cd frontend
pnpm install
pnpm dev                          # http://localhost:3000
```

Open **http://localhost:3000**, fill the planner, and generate a trip. The Chroma index
builds itself on the first request (re-embeds the corpus — cheap).

> Without Supabase/Tavily configured, the app still runs — sharing and live-conditions just
> degrade gracefully.

---

## Deploy

Split deploy — both auto-deploy from GitHub. See **[DEPLOY.md](DEPLOY.md)** for the full guide.

- **Backend → Render** — `requirements.txt` + `uvicorn api.main:app --host 0.0.0.0 --port $PORT`; set `OPENAI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `ALLOWED_ORIGINS`.
- **Frontend → Vercel** — root directory `frontend`; set `NEXT_PUBLIC_API_URL` to the Render URL.

> 🔒 API keys live **only** on the backend (Render), never in the frontend/Vercel.

---

## Notable engineering decisions

Recorded in **[DECISIONS.md](DECISIONS.md)** — a few highlights:

- **Grounding** — costs/routes/permits come from the corpus, not the LLM (trust).
- **No live Maps API** — start-city routing is composed through a curated hub table
  (`origin → Islamabad → destination`), exploiting the region's hub-and-spoke geography.
- **Cost as tiers, not a range** — budget/standard/luxury map to positions in each
  destination's cost range, with a real per-component breakdown (hotels/food/local/fuel).
- **Tag re-ranking** — semantic search is re-ranked by how well a destination's tags match
  the requested vibes/interests, so the choice reflects the inputs (not one generic best-match).
- **Suggest, don't book** — logistics are deep-links (hotels/bus/jeep/flights), avoiding
  fragile third-party integrations.

---

*A learning build by Areeha Zulfiqar — RAG + AI agents, shipped as one real product.*
