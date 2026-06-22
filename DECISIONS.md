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
