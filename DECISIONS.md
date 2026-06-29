# Roamio — Engineering Decisions & Learnings

A running log of the real technical challenges hit while building Roamio (an AI
trip planner for Northern Pakistan, built on RAG + a LangGraph planning agent),
and the reasoning behind each decision.

This is not a changelog. Each entry records a *problem*, the *decision* made, the
*why* (including tradeoffs and what was rejected), and the *takeaway* — so the
thinking is reusable, not just the outcome.

> Format per entry: **Challenge → Decision → Why → Takeaway.**

---

## 001 · Curating the corpus by hand, and catching AI's factual errors
**Date:** 2026-06 (Week 1) · **Area:** Data / RAG corpus

**Challenge.** The corpus (the project's moat) had to be accurate, but I was
seeding it partly with AI-generated destination data. The AI produced
*plausible but wrong* facts — most notably it overstated road **drive times**
(e.g. Islamabad→Hunza), which would directly break the planning agent's
feasibility check later.

**Decision.** Hand-write the first 2 destinations (Hunza, Skardu) myself,
treat all AI-generated values as **drafts to verify**, not truth, and cross-check
high-risk fields (drive times, permits, season access) against real sources
(Wikivoyage, travel blogs, r/pakistan, Google Maps).

**Why.** A wrong permit rule or drive time ruins a real trip — these are
trust-critical fields. Verifying *everything* is slow; verifying nothing is
reckless. So I triaged fields by blast radius (trip-breaking vs cosmetic) and
spent verification time only on the high-risk ones.

**Takeaway.** LLMs are confidently wrong on hyperlocal specifics. The skill isn't
"trust" or "distrust" — it's *knowing which facts to verify*. This is exactly why
RAG over a human-QA'd corpus beats asking a raw LLM: the corpus is the place I
inject verified truth.

---

## 002 · Never store numbers inside strings
**Date:** 2026-06 (Week 1) · **Area:** Schema design

**Challenge.** Initial corpus stored values like `"~14-18 hrs"` and
`"April to October"` as human-readable strings. But the planning tools
(`build_route`, `check_feasibility`) need to *compute* on these — add drive
hours, check if a month is in season.

**Decision.** Store machine-usable values as structured data
(`{ "min_hours": 14, "max_hours": 18 }`, `open_months: [4,5,6,7,8,9,10]`) while
keeping the prose version alongside (`note`, `best_season.highlights`) for the
embedder and the UI.

**Why.** The corpus has two consumers with opposite needs: the **embedding/retrieval
layer** wants readable text, the **deterministic tools** want numbers. Trying to
serve both with one representation fails one of them. Storing both is cheap and
serves each cleanly.

**Takeaway.** "Structure for the machine, keep text for the meaning." A field's
representation should be driven by *who consumes it*, not by what's easy to type.

---

## 003 · Triaging a 25-item "improvements" list — letting data force the schema
**Date:** 2026-06 (Week 1) · **Area:** Schema design / scope control

**Challenge.** Received a long list of well-intentioned schema "improvements"
(coordinates, elevation, per-activity objects, safety ratings, normalizing into
14 related tables, etc.). All sounded senior. Applying them all would have
ballooned hand-curation work across 15 destinations.

**Decision.** Applied only the 4 that feed a tool I'm actually building in the next
3 weeks (numeric drive times, month integers, `recommended_trip_days`, a
`description` for embedding). Deferred the rest with an explicit **trigger rule**:
add a field the day a real destination can't be represented without it. Rejected
the normalization-into-tables suggestion outright.

**Why.** A schema is graded on whether each field has a *consumer*, not on how rich
it is. Speculative fields are cost (hand-fill ×15, guessed data) with no benefit
until a tool reads them. And **denormalized single-document-per-destination is
correct for a RAG corpus** — you embed the whole doc as one chunk; normalizing
into related tables is a relational-app pattern that doesn't fit, and would kill
momentum.

**Takeaway.** Premature schema richness is the same trap as premature optimization.
"Let the data force the schema" beats "design for every hypothetical."

**Update (2026-06-22).** The normalization idea returned in a more specific form:
split attraction-level data (e.g. "needs a 4x4 for Lake Saif-ul-Malook",
per-attraction `entry_fee`/`best_months`) into their own records, referenced by id.
Deferred again — same reasoning, plus: for *retrieval* the flat one-chunk-per-
destination doc is actively better (splitting fragments the embedding). **Trigger to
revisit:** when the Week 3 itinerary writer needs to pick/skip individual attractions
by budget/fitness/season and the flat structure blocks it. Noting that consumer-less
"senior" schema suggestions have now arrived 3 times — resisting them is the skill.

---

## 004 · Prompt/schema debugging — one field was answering two questions
**Date:** 2026-06-22 (Week 1) · **Area:** LLM extraction / prompting

**Challenge.** Testing structured extraction (`with_structured_output`), the
field `best_months` for Malam Jabba (a ski-AND-summer resort) returned
`[12,1,2,3,6,7,8]`. It *looked* like an AI error.

**Decision.** Diagnosed it as a **schema definition bug, not a model error** — the
extraction was faithful to the source text. The field secretly conflated two
questions: "when is it *accessible*?" vs "when is it best for *my vibe*?".
Split the concept: `open_months` = accessibility (union, tool-consumed), and
kept peak/vibe timing in prose `best_season.highlights`. Documented a trigger to
add a structured `seasons[]` array only when a genuinely two-season destination
enters the corpus. Sharpening the field description alone changed the output from
`[12,1,2,3,6,7,8]` to `[12,1,2]`.

**Why.** A vague field description *is* a vague instruction — the model can't read
intent. The single-season seed destinations (Hunza, Skardu) hid the ambiguity;
a two-season place exposed it. Most "the AI got it wrong" moments are actually
"I asked ambiguously."

**Takeaway.** In LLM work, always ask "is this the model failing, or did I specify
badly?" The fix is usually a sharper spec, not a smarter model. Field descriptions
are prompts — write them as precisely as you'd write a function contract.

---

## 005 · A schema validator to make correctness mechanical
**Date:** 2026-06-22 (Week 1) · **Area:** Tooling / data quality

**Challenge.** As the corpus grows to 15 hand-curated destinations, silent data
errors (`min_hours > max_hours`, a month of 13, a missing required field, a
duplicate id) become likely and hard to spot by eye.

**Decision.** Wrote `corpus/validate_corpus.py` that checks every destination
against `corpus/SCHEMA.md` and exits non-zero on any violation (so it can gate a
commit later). Also promoted `open_months` to a top-level field when the validator
work surfaced that the data had drifted from the documented schema.

**Why.** Hand-curated data is exactly where mechanical mistakes hide. A cheap,
deterministic check removes a whole class of bugs and frees verification effort
for the things only a human can judge (is this fact actually true?).

**Takeaway.** Write the guardrail before you scale the data, not after you ship a
bug. Documentation (SCHEMA.md) plus an executable check (validate_corpus.py) keeps
the doc and the data honest with each other.

---

## 006 · Start-city routing — reject a live Maps API, compose through a curated hub
**Date:** 2026-06-22 (Week 2) · **Area:** Architecture / routing

**Challenge.** `build_route` only stored drive times from Islamabad, but the planner
form lets users start anywhere (Lahore, Karachi…). Hardcoding "everyone starts in
Islamabad" would gut the app's purpose. The tempting fix was a live Google Maps API.

**Decision.** Rejected the live Maps API. Instead, exploited the region's geography:
all Northern Pakistan routes funnel through the Islamabad/Hazara corridor, so
`drive_time(city -> destination) = (city -> Islamabad) + (Islamabad -> destination)`.
The second leg already lives in corpus.json; added the first leg as a small curated
`origin_hubs.json` (≈8 cities). `build_route` composes the two at runtime.

**Why.** A live API means billing setup, an external runtime dependency on every
request, latency, and failure handling — and it teaches Google Cloud setup, not
RAG/agents. The hub-composition gives real, city-specific drive times with zero
runtime dependency, is extensible (one JSON line per new city), and stays true to
the project's "curate static data, avoid fragile integrations" principle. Far cities
(Karachi 76h round-trip) even surface a "most travellers fly" note that
`check_feasibility` can act on. Limitation (stated openly): models road travel via
the hub; doesn't compute flights or non-hub origins — acceptable for a Northern-
Pakistan v0.

**Takeaway.** Before reaching for an external API, check whether the domain's
*structure* lets you decompose the problem into a small static dataset. Hub-and-spoke
geography turned a 15×15 routing problem into a one-leg lookup.

**Update (2026-06-22) — the model's boundary.** Adding northern origin cities
(Gilgit, Skardu, Abbottabad…) exposed that the sum-model only holds when the origin
is SOUTH of the hub. A northern origin is already up the corridor, so routing it back
through Islamabad over-estimates (Gilgit→Hunza computes 27h vs ~3h real). I tried a
"corridor position" formula (`|dest − origin|`) but it CREATED new errors: Northern
Pakistan is a **tree** (separate KKH / Kaghan / Swat spurs), not a line, so it made
Gilgit→Naran = 0h. Mature call: don't fake precision with a formula that's still
wrong — keep the honest sum-model, mark northern origins with `"side": "north"`, and
emit a warning that their estimate is an upper bound (the safe direction for
feasibility). **Takeaway:** scope a tool to where its approximation is valid and flag
the boundary, rather than chase a more complex model that's still incorrect. A real
fix would need a road graph — out of scope for v0.

---

## 007 · Refactor the deterministic orchestrator into a LangGraph state machine
**Date:** 2026-06-25 (post-v0) · **Area:** Architecture / agent

**Challenge.** The planning pipeline (search → route → cost → feasibility → re-plan →
write) first shipped as a plain Python function with a `while` loop. It worked and was
the right way to *ship*, but it skipped the framework skill the project exists to teach,
and didn't expose the hooks needed for streaming and memory.

**Decision.** Re-expressed the exact same flow as a LangGraph `StateGraph`: each tool a
node, the re-plan as a **conditional edge** (`decide()`: feasible → write, else → replan
→ plan). `generate_itinerary()` now runs the compiled graph. Behaviour and output are
identical — it's a lateral move on purpose.

**Why.** A `while` loop and a graph produce the same itinerary, so the value isn't the
result — it's what the framework *unlocks*: node-by-node **streaming** to the UI,
**checkpointing/memory**, a diagram you can draw in an interview, and clean extensibility
(the Tavily node slotted in as one more edge). It's also the canonical "agent" shape: the
conditional loop-back IS the agent.

**Takeaway.** Ship the simple deterministic version first to prove the logic, then adopt
the framework for the capabilities (and learning) it adds — not because the framework
makes the answer better. Know *why* you're paying the abstraction cost.

---

## 008 · Loosen activity grounding — let the LLM enrich days, keep facts grounded
**Date:** 2026-06-22 (Week 2) · **Area:** LLM grounding / product

**Challenge.** Strict grounding (drop any activity not in the corpus) made day cards
feel thin — 1-2 activities per day — because the corpus lists only a handful of named
landmarks per destination.

**Decision.** Relaxed the rule for *activities only*: the writer may add generic
experiences (a local meal, a bazaar stroll, a riverside walk) alongside the corpus
landmarks, but is forbidden from inventing **named** places. Trust-critical data
(costs, permits, route, season) stays 100% grounded.

**Why.** Activities are *suggestions*, not booking-critical facts, so the grounding bar
can be lower there than for a price or a permit rule. Generic experiences can't be
"wrong" the way a fabricated fort would be. This fills out the days without reintroducing
hallucination risk where it actually matters.

**Takeaway.** Grounding isn't all-or-nothing — set the strictness per field by how much a
user would *trust* it. Tier your guarantees: facts locked, flavour free.

---

## 009 · Cost as tiers (budget/standard/luxury), not a min–max range
**Date:** 2026-06-27 (post-v0) · **Area:** Cost model / UX

**Challenge.** Returning costs as a wide `[min, max]` range confused users ("is this per
day? per person? the whole trip?") and gave no way to express *how* they want to travel.

**Decision.** Added a **stay-tier** input (budget / standard / luxury). The tier sets
where in each destination's cost range hotels and food land (low/mid/high); local
transport and fuel are tier-independent. Output is now a **single** number with a real
per-component breakdown (hotels / food / local / fuel) — and the form shows approximate
per-night PKR per tier.

**Why.** A single tier-anchored number is far clearer than a range, and the tier finally
resolves the long-deferred "where in the range?" question with an actual user input rather
than a guess. The per-component breakdown answers "what am I paying for?" honestly.

**Takeaway.** When a range confuses users, the fix is often a *new input* that collapses
it to a meaningful single value — not better wording on the range.

---

## 010 · Tag re-ranking — make the destination choice reflect the inputs
**Date:** 2026-06-27 (post-v0) · **Area:** RAG / retrieval quality

**Challenge.** One destination (Naran & Kaghan) ranked #1 for *every* query — adventure,
culture, lakes, even "religious." Its corpus text is a generic-match magnet, so pure
semantic similarity always returned it, and short (single-stop) trips always showed it.

**Decision.** After semantic retrieval, **re-rank** candidates by how many of the
requested vibes/interests overlap each destination's `tags`, breaking ties by embedding
distance. Also made vibe multi-select and added an interests picker so there's real signal
to match on.

**Why.** Pure cosine similarity rewards generically-dense text. Re-ranking by explicit
tag overlap makes the *inputs* decide — "culture + heritage" now surfaces Chitral/Kalash,
"forests + waterfalls" surfaces Kumrat. It's a cheap hybrid (semantic recall + structured
precision) that fixed the single most-visible quality bug.

**Takeaway.** Pure vector search can be quietly biased toward verbose entries. A light
structured re-rank on top of semantic recall is often the difference between "feels
generic" and "feels like it understood me."

---

## 011 · Logistics as deep-links — suggest, don't book
**Date:** 2026-06-27 (post-v0) · **Area:** Product / integrations

**Challenge.** Users wanted hotel/transport booking in the itinerary. Real booking
integrations are the fragile third-party trap the project deliberately avoids.

**Decision.** Added a "Plan your logistics" section of **deep-links** — Booking.com
search per destination, Daewoo/Faisal Movers for buses, a jeep-hire search, flights to
the nearest northern airport — generated from the trip's own data. No APIs, no bookings.

**Why.** Deep-links give users the practical next step (where to actually book) with zero
integration surface, zero runtime dependency, and zero maintenance — and they're a clean
affiliate-revenue path later. Stays true to the "suggests, does not book" moat.

**Takeaway.** "Useful" doesn't require "integrated." A well-targeted external link often
delivers most of the value of an integration at none of the fragility.

---

## 012 · Stay northern + RAG-ground the writer in real sources
**Date:** 2026-06-29 (post-v0) · **Area:** Scope / RAG / content quality

**Challenge.** Two linked questions. (1) Adding Lahore exposed that the single
**Islamabad-hub** router can't model non-northern trips — Gujrat→Lahore shouldn't route
via Islamabad. A multi-hub tree would fix it but is real complexity for ~one city. (2)
The writer's "AI" was thin: it got only activity *names* from the corpus and improvised
generic prose, with no real grounding, sources, or faithfulness.

**Decision.** Keep Roamio **northern-only** (drop Lahore, keep the hub model — it's correct
for the northern corridor) and spend the effort where the AI engineering is: a **second
RAG pipeline that grounds the writer**. `corpus/ingest_content.py` pulls real travel text
per destination (Wikivoyage guides + Wikipedia + a Tavily top-up) and caches it;
`rag/content.py` chunks/embeds it into a separate `destination_content` Chroma collection;
the writer retrieves per-stop snippets, grounds each day's notes in them, and emits a
**citation table** (`sources`) the UI renders as "Grounded in real sources."

**Why.** Pakistan tourism *is* the north, so the hub model is right and non-northern is low
payoff. Grounding the prose in cited real content is the higher-value, more interesting
work — it fixes authenticity (the day notes now carry real specifics, not plausible
filler) and keeps the "code decides, the LLM only writes — now from sources it must cite"
principle. Authoritative sources (Wikivoyage/Wikipedia) are blended in so web listicles
don't dominate the citations.

**Takeaway.** When a feature forces a disproportionate architecture change for thin payoff,
the right move can be to *narrow scope* and reinvest the effort in the part that actually
makes the product better — here, turning a templated writer into a grounded, cited one.

---

## 013 · Faithfulness guard — soften, don't block; trust the corpus too
**Date:** 2026-06-29 (post-v0) · **Area:** RAG / trust / LLM-as-judge

**Challenge.** The grounded writer can still drift — assert an age, a superlative ("highest
in the world"), or a place that isn't actually in its sources. We wanted a verification
layer without making trips fail or stripping legitimate, corpus-validated landmarks.

**Decision.** A second LLM (temp 0) acts as a **fact-checker** after the writer: for each
stay day it checks every specific named claim against that day's retrieved snippets **and**
the stop's corpus activity list (both are trusted ground truth). Unsupported specifics are
**softened to generic wording** (not deleted, not blocked); each day gets a `verified` flag
and the trip a `{checked, verified}` summary, surfaced as a per-day "Fact-checked" chip and
a "N days fact-checked against sources" badge. The check is resilient — any judge failure
leaves notes untouched (`verified=None`), never breaking a trip.

**Why.** Checking only the retrieved snippets over-flagged real landmarks (Baltit/Altit
Forts are in the corpus but weren't in the top-k chunks), so the corpus activity list had to
count as support. Softening beats blocking: the traveller still gets a warm, complete note,
just without the unverifiable claim. It turns the grounding from "cites sources" into "cites
sources AND verifies against them" — the trust story the UI can now show.

**Takeaway.** An LLM-as-judge is most useful when it *repairs* rather than *rejects*, and
when "ground truth" includes every trusted source you have — not just the one pipeline that
happened to retrieve this turn.

---

## 014 · Natural-language trip tweaking — LLM parses intent, code applies it
**Date:** 2026-06-29 (post-v0) · **Area:** AI / UX / structured output

**Challenge.** "Tweak this trip" was regex-only — it caught "+2 days", "make it cheaper",
"remove X" and nothing else. "Skip the long drives and add a cultural day, keep it under
100k" did nothing. The brittle pattern list was the most obvious place to add real AI.

**Decision.** A free-text tweak now goes to `/interpret-tweak`, where an LLM (temp 0, structured
output) parses it into a typed `TweakOps` schema (set_days/days_delta, set_budget/budget_delta_pct,
set_transport, set_stay_style, set_vibe, add/remove_interests, exclude_destinations, clear_focus,
set_month, unsupported, summary). The frontend's `applyTweakOps` validates and applies them
deterministically — **absolute fields win over deltas** (the model sometimes emits both) — then
re-plans. Unsupported asks (book a hotel, a flight, a non-northern place) are flagged and explained
instead of silently ignored. If the interpreter is unreachable, the legacy regex path still runs, so
a tweak never hard-fails.

**Why.** This is the cleanest expression of the project's spine: the **LLM interprets messy human
intent into a typed schema; code makes the actual decisions** (clamping, precedence, validation).
It turns a keyword-matcher into something that understands compound, conversational requests, while
keeping every applied change deterministic and safe. The summary line gives the user honest feedback
on what changed.

**Takeaway.** The highest-leverage place for an LLM is often the messy edges of input parsing — not
the core logic. Let it normalise intent into structure, then keep the consequential decisions in code
you can test. Deterministic precedence rules (absolute > delta) absorb the model's over-eagerness.
