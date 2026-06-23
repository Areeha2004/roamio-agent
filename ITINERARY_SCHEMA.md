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
| `summary` | object | Header card: title, feasibility, totals, one-line headline |
| `warnings` | array | Banner items — permit + season cautions |
| `days` | array | The day-by-day cards (the core of the page) |
| `cost_breakdown_pkr` | object | The cost table (from `estimate_cost`) |
| `meta` | object | Disclaimer, share id (filled in Week 4) |

### `request` (echoed input)
```jsonc
{ "days": 8, "budget_pkr": 300000, "start_city": "Islamabad",
  "group_type": "family", "vibe": "adventure", "month": 7 }
```
Note `month` (1–12) is part of the input contract — `check_feasibility` needs it.

### `summary`
```jsonc
{ "title": "8-day family adventure to Hunza",   // LLM-written
  "feasible": true,
  "destinations": ["hunza-valley"],             // corpus ids
  "total_cost_pkr": [157200, 444000],           // [min, max] range
  "total_drive_hours": 36,
  "headline": "A relaxed family loop up the Karakoram Highway to Hunza." }  // LLM, 1 line
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
  "activities": ["Baltit Fort", "Attabad Lake (boating)"],   // from corpus
  "notes": "Forts in the morning, lake in the afternoon." }
```

### `cost_breakdown_pkr` — straight from `estimate_cost`
```jsonc
{ "hotels": [42000, 210000], "food": [48000, 96000],
  "local_transport": [24000, 48000], "long_haul_transport": [43200, 90000],
  "total": [157200, 444000] }
```

### `meta`
```jsonc
{ "share_id": null,                 // filled in Week 4 when trips are saved
  "disclaimer": "Costs are estimates — verify before booking." }
```

---

## Design notes
- **Costs are always `[min, max]` ranges**, never single numbers — consistent with
  the corpus and `estimate_cost`. The UI shows "157,200 – 444,000 PKR".
- **`days[]` separates `travel` vs `stay`** so the UI can style them differently
  (a driving card vs an activity card) — one `type` field, no guessing.
- **Deterministic fields vs LLM fields:** numbers (costs, drive hours, ids, activities)
  come from the *tools/corpus* and must not be invented by the writer. The LLM only
  writes the prose fields (`title`, `headline`, `notes`). This keeps the trustworthy
  data trustworthy — the same grounding principle as `extract_destination`.
