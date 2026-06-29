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
| The day-by-day prose | the **LLM** (`gpt-4o-mini`) writes titles & notes, **grounded in retrieved real sources** (RAG) and cited | ✅ (grounded) |
| Faithfulness of the prose | an **LLM judge** checks each note's specific claims against its sources/corpus, softening anything unsupported | ✅ (verify) |
| "Tweak this trip" | the **LLM** parses free-text into typed edit ops; **Python validates & applies** them | parse only |

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
                 │  write   │   LLM writes the day-by-day itinerary, GROUNDED in real
                 └────┬─────┘   retrieved sources, then an LLM judge FACT-CHECKS each note
                      ▼
                     END  ──►  itinerary JSON returned (nothing persisted yet)
```

The full request flow:

```
Next.js form  →  FastAPI POST /generate-itinerary/stream  →  LangGraph agent
   → (streams progress: "Searching… Building route… Checking conditions… Writing…")
   → itinerary JSON  →  rendered in the UI
   → saved to Supabase ONLY when the user shares → shareable /trip/[id]
```

> **Save-on-share:** generating a trip persists nothing. A trip is written to Supabase the
> first time the user copies its share link (`POST /share`), which mints the `share_id`.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | **Next.js 16** + React 19 + Tailwind v4 (Figma-designed) |
| Backend | **FastAPI** (streaming NDJSON) |
| LLM | **gpt-4o-mini** via `langchain-openai` |
| Agent framework | **LangGraph** (`StateGraph` + conditional edge) |
| RAG | OpenAI `text-embedding-3-small` + **Chroma** — two collections (destinations + grounding content) |
| Grounding content | **Wikivoyage + Wikipedia + Tavily**, chunked & embedded for the writer to cite |
| Live search | **Tavily** (road/weather conditions) |
| Memory / sharing | **Supabase** (Postgres) |
| Hosting | **Vercel** (frontend) + **Render** (backend) |

---

## What's in the repo

```
corpus/           the moat — 15 curated destinations + grounding content
  corpus.json       15 Northern-Pakistan destinations (data + photos)
  SCHEMA.md         field definitions (one field = one job)
  validate_corpus.py  schema/validity guardrail
  origin_hubs.json  start-city → Islamabad-hub drive legs
  extract_destination.py  LLM tool to draft new destinations from raw text
  ingest_content.py   OFFLINE: pull Wikivoyage/Wikipedia/Tavily text per destination
  content/            cached grounding text per destination (committed, reproducible)
rag/
  search.py         RAG #1: destination retrieval (Chroma `destinations` collection)
  content.py        RAG #2: grounding-content retrieval (Chroma `destination_content`)
tools/
  planning.py       build_route · estimate_cost · check_feasibility (deterministic)
  web_search.py     Tavily wrapper (graceful if unavailable)
agent/
  orchestrator.py   the LangGraph state machine (generate_itinerary)
  writer.py         the LLM writer — grounded in real sources + a faithfulness guard
  tweak.py          NL "tweak this trip" → typed edit ops (structured output)
db/
  store.py          Supabase save_trip / get_trip (graceful if unconfigured)
api/
  main.py           FastAPI: /generate-itinerary(/stream), /interpret-tweak, /share, /trip/{id}
evals/
  run.py            lean harness: deterministic planning checks + opt-in E2E (`--e2e`)
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

Open **http://localhost:3000**, fill the planner, and generate a trip. Both Chroma
collections (destinations + grounding content) build themselves on the first request — the
destination index re-embeds `corpus.json`; the content index embeds the committed
`corpus/content/*.json`. No manual build step.

> Without Supabase/Tavily configured, the app still runs — sharing and live-conditions just
> degrade gracefully.

**Evals** (optional):
```bash
python evals/run.py            # deterministic planning checks — fast, no LLM/$$
python evals/run.py --e2e      # + a small full-pipeline pass (real LLM + web calls)
```

> To refresh the grounding content from the web, re-run `python corpus/ingest_content.py`
> then `python rag/content.py --rebuild`. The cached `corpus/content/` is committed, so this
> is only needed when you add destinations or want fresher sources.

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
- **RAG-grounded, cited writer** (ADR 012) — day notes are written from real retrieved sources
  (Wikivoyage/Wikipedia/web) and show their citations, instead of improvising plausible prose.
- **Faithfulness guard** (ADR 013) — an LLM judge fact-checks each note's specific claims against
  its sources + corpus landmarks, softening (not deleting) anything unsupported.
- **Natural-language tweaking** (ADR 014) — free-text changes ("cheaper, add a cultural day, skip
  Murree") are parsed by the LLM into typed edit ops that Python validates and applies.
- **Lean evals** (ADR 015) — `evals/run.py` asserts the deterministic math and (opt-in) runs a
  small E2E pass that reads the system's own faithfulness, rather than stacking another judge.

## Status & known limitations

Roamio is **Northern-Pakistan-only by design** — the single-hub router is correct for the
northern corridor, where roads genuinely funnel through Islamabad. Reaching non-northern or
AJK-internal start cities accurately needs a **multi-hub / road-tree** router, consciously
**deferred to a future version** (see [BACKLOG.md](BACKLOG.md)). Costs and drive times are
estimates — the UI says so, and a trip is never booked, only suggested.

---

