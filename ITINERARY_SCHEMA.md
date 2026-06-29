# Roamio Itinerary Schema — the backend ↔ frontend contract

This is the JSON the backend produces and the frontend renders. It is the single
contract shared by three things:
- **the itinerary writer** (the LLM step) must *produce* this shape,
- **FastAPI** `POST /generate-itinerary` *returns* it,
- **the Next.js UI** *renders* it (day cards, cost, banners, share link).

Lock this before building the agent or the UI, so all three aim at the same target.
Same discipline as the corpus: one field = one job; only add fields a consumer needs.

A full, valid example lives in `samples/itinerary_example.json` — use it as mock data
for the UI and as the target output for the writer.

---

## Top-level shape

| Field | Type | Purpose / consumer |
|---|---|---|
| `request` | object | Echo of the user's constraints (provenance; the share page shows it) |
| `summary` | object | Header card: title, feasibility, totals, budget status, faithfulness, headline |
| `warnings` | array | Banner items — permit + season cautions |
| `route_summary` | object | Route legs + one-way/round-trip hours + car-vs-local transport options |
| `tips` | array | Practical "good to know" tips (deduped from the visited stops) |
| `sources` | array | Grounding citations the day notes were written from (Wikivoyage/Wikipedia/web) |
| `days` | array | The day-by-day cards (the core of the page) |
| `cost_breakdown_pkr` | object | The cost table (single PKR numbers, from `estimate_cost`) |
| `meta` | object | Disclaimer + `share_id` (set only when the user shares the trip) |

### `request` (echoed input)
```jsonc
{ "days": 8, "budget_pkr": 300000, "start_city": "Islamabad",
  "group_type": "family", "vibe": "adventure", "month": 7 }
```
Note `month` (1–12) is part of the input contract — `check_feasibility` needs it.

### `summary`
```jsonc
{ "title": "8-Day Adventure Trip to Hunza Valley",   // LLM-written
  "feasible": true,
  "destinations": ["hunza-valley"],                  // corpus ids
  "destination_names": ["Hunza Valley"],
  "hero_image": "https://…",
  "total_cost_pkr": 165600,                          // single PKR number (chosen stay tier)
  "total_drive_hours": 36,
  "season": { "months": "April to October", "highlights": "…", "avoid": "…" },
  "budget": { "status": "comfortable", "over_by_pkr": 0, "budget_pkr": 200000 },
  // budget.status ∈ comfortable | tight | slightly_over | over_budget
  "faithfulness": { "checked": 3, "verified": 2 },   // stay-day notes fact-checked vs sources
  "headline": "A relaxed loop up the Karakoram Highway to Hunza." }  // LLM, 1 line
```

### `warnings` — banner items
```jsonc
[ { "type": "permit", "text": "Carry CNIC; foreigners may need an NOC near Khunjerab." },
  { "type": "season", "text": "Days are cold even in July — pack layers." } ]
```
`type` is an enum: `permit` | `season` | `safety` | `info`. Pulled from corpus
`permits` / `best_season` / `tips`.

### `days[]` — the day-by-day cards
Each day is either a **travel** day (driving between places) or a **stay** day
(time at one destination). One field — `type` — distinguishes them.
```jsonc
{ "day": 1,
  "type": "travel",                 // "travel" | "stay"
  "title": "Islamabad → Chilas",    // LLM
  "from": "Islamabad", "to": "Chilas",
  "drive_hours": 8,
  "stop_id": null,                  // corpus id when type == "stay", else null
  "activities": [],                 // populated on stay days
  "notes": "Long KKH driving day; overnight in Chilas." }  // LLM
```
A `stay` day:
```jsonc
{ "day": 3, "type": "stay", "title": "Explore Karimabad",
  "from": null, "to": null, "drive_hours": 0,
  "stop_id": "hunza-valley",
  "image": "https://…",
  "activities": ["Baltit Fort", "Attabad Lake (boating)"],   // corpus landmarks + generic experiences
  "source_refs": ["S1", "S2"],     // which `sources` informed this day's note
  "verified": true,                // faithfulness guard: true=clean, false=softened, null=not checked
  "notes": "Forts in the morning, lake in the afternoon." }  // LLM, grounded in the sources
```

### `route_summary`
```jsonc
{ "legs": [ { "from": "Islamabad", "to": "Hunza Valley", "hours": 18, "via": "via the KKH" } ],
  "one_way_hours": 18, "round_trip_hours": 36,
  "transport": "car",                              // chosen mode
  "transport_options": {                           // both, so the UI can compare upfront
    "car":   { "label": "Private car",     "cost": 20000, "one_way_hours": 18,   "round_trip_hours": 36 },
    "local": { "label": "Local / public",  "cost": 14000, "one_way_hours": 21.6, "round_trip_hours": 43.2 } } }
```

### `sources` — grounding citations (RAG)
```jsonc
[ { "ref": "S1", "source": "wikivoyage", "title": "Hunza Valley", "url": "https://…", "dest_id": "hunza-valley" },
  { "ref": "S2", "source": "wikipedia",  "title": "Hunza Valley", "url": "https://…", "dest_id": "hunza-valley" } ]
```
`source` ∈ `wikivoyage` | `wikipedia` | `web`. Each `days[].source_refs` points back here.

### `cost_breakdown_pkr` — straight from `estimate_cost` (single PKR numbers)
```jsonc
{ "hotels": 84000, "food": 27000, "local_transport": 18000,
  "intercity_transport": 20000, "total": 149000 }
```

### `meta`
```jsonc
{ "share_id": null,                 // set to a real id ONLY when the user shares (POST /share)
  "disclaimer": "Costs are estimates — verify current prices before booking." }
```

---

## Design notes
- **Costs are single PKR numbers, not ranges.** A trip picks a stay tier
  (budget/standard/luxury), so the cost is one number with a real per-component breakdown
  (hotels/food/local/intercity) — see DECISIONS #003. The UI shows "PKR 149,000".
- **`days[]` separates `travel` vs `stay`** so the UI can style them differently
  (a driving card vs an activity card) — one `type` field, no guessing.
- **Deterministic vs LLM fields:** the trustworthy numbers (costs, drive hours, ids, route,
  feasibility, budget status) come from the *tools/corpus* and are never invented by the
  writer. The LLM writes the prose (`title`, `headline`, `notes`) — now **grounded in real
  retrieved `sources`** and **fact-checked** by the faithfulness guard, which softens any
  unsupported specific claim and records the result in `verified` / `summary.faithfulness`.
