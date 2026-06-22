# Roamio Corpus Schema — Field Definitions

The single source of truth for what every field in `corpus.json` means.

**Two rules this file exists to enforce:**
1. **One field answers exactly one question.** If a field needs the word "or" to
   describe it, it's doing two jobs — split it.
2. **The schema grows only when a real destination forces it.** Don't add fields
   for hypothetical places. Add them the day a destination can't be represented.

When you build `extract_destination()` in Week 2, the extractor prompt should
reuse these definitions **verbatim** — a vague field description produces a vague
extraction (we proved this with the Malam Jabba `best_months` bug).

---

## Required fields (every destination must have these)

| Field | Type | Answers exactly one question |
|---|---|---|
| `id` | string (slug) | What is the stable key? Never changes. `"hunza-valley"`. |
| `name` | string | What is it called? (Display name, may change.) |
| `region` | string | Which province / administrative area? |
| `description` | string | One-sentence summary — this is the main text the embedder reads. |
| `tags` | string[] | What vibes/terrain does it offer? (3–6 keywords.) |
| `recommended_trip_days` | {min, ideal} | How many days does it realistically deserve? Used by `check_feasibility`. |
| `drive_times` | object | How long to get there? Numeric `min_hours`/`max_hours` per origin + a prose `note`. Used by `build_route`, `check_feasibility`. |
| `open_months` | int[] (1–12) | **ACCESSIBILITY ONLY** — see below. Used by `check_feasibility`. |
| `best_season` | object | Human-readable timing nuance: `months` (prose), `highlights`, `avoid`. |
| `cost_ranges` | object | Price RANGES (never live prices) in PKR. Used by `estimate_cost`. |
| `permits` | string | What paperwork (CNIC / NOC) is needed, and for whom? |
| `stays` | string[] | Where can you base yourself? |
| `activities` | string[] | What is there to do? |
| `tips` | string[] | Practical first-timer advice. |

---

## The season fields — read this carefully (this is where the bug was)

`best_months` used to conflate two different questions. We split them:

### `open_months` — ACCESSIBILITY
> Integer months (1–12) when the destination is **physically reachable and worth
> visiting at all** — roads open, not snowed shut. This is the **UNION** across
> every activity the place offers.

- A ski-and-summer resort like Malam Jabba is *accessible* in both winter and
  summer, so its `open_months` includes both. That is correct.
- `check_feasibility` uses this to reject impossible trips ("don't send someone to
  Deosai in January").

### `best_season.highlights` — PEAK TIMING (prose, for now)
> Free-text note on what's good when, including activity-specific timing.
> e.g. "Deosai opens late June; cherry blossom in early April."

This holds the nuance that `open_months` deliberately flattens.

### `seasons[]` — STRUCTURED PEAK TIMING (DO NOT ADD YET)
> **Trigger to add this field:** the first time a destination serves two distinct
> seasons/vibes with non-overlapping peak months (e.g. Malam Jabba = ski 12–3 vs
> hike 6–8), and the prose `highlights` is no longer enough for the tool layer.
>
> Shape when you add it:
> ```json
> "seasons": [
>   { "activity": "skiing", "months": [12, 1, 2, 3] },
>   { "activity": "hiking",  "months": [6, 7, 8] }
> ]
> ```

Until that day, Hunza and Skardu (single summer season) need nothing here.

---

## Conventions

- **Costs are RANGES, never live/scraped prices.** `[4000, 15000]`. Refresh periodically.
- **Months are integers 1–12**, never names — so tools can compare/filter without parsing.
- **Numbers never live inside strings** when a tool needs to compute on them
  (drive times are `min_hours`/`max_hours`, not `"~14-18 hrs"`).
- **`id` is the slug** — it doubles as the URL (`/trip/hunza-valley`). No separate `slug` field.
