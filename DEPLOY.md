# Deploying Roamio

Roamio is a **split deploy** (one app, two hosts) — both auto-deploy from GitHub on push:

| Part | Host | Why |
|---|---|---|
| Frontend (Next.js) | **Vercel** | First-class Next.js hosting |
| Backend (FastAPI + RAG agent) | **Render**, from the `Dockerfile` | Long-running Python server + filesystem for Chroma; the agent takes ~10–15s/request, which Vercel serverless can't do |

**Live:** frontend `https://roamioagent.vercel.app` → backend `https://roamio-api-docker.onrender.com`.

Deploy the **backend first** (you need its URL for the frontend).

---

## 1. Backend → Render

Two ways to run it. **Docker is what's deployed today**; the Python runtime is kept here
because it still works and Railway uses it.

### Option A — Docker (current)

1. Push to GitHub.
2. Render → **New → Web Service** → connect this repo.
3. Settings:
   - **Root Directory:** *(blank — repo root)*
   - **Language:** **Docker** — Render reads the `Dockerfile` at the repo root
   - **Health Check Path:** `/health`
   - No build or start command: the image defines both.

**It fits the free tier.** CI measures this on every build (see
`.github/workflows/docker.yml`): the image is ~625 MB on disk, but **idle memory is ~133 MB
against Render's 512 MB cap**. The Chroma index adds only a couple of MB once built.

### Option B — Python runtime

   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`

### Either way — environment variables
   - `OPENAI_API_KEY` = your OpenAI key **(required)**
   - `ALLOWED_ORIGINS` = your Vercel URL (add after step 2 below; can edit anytime), e.g. `https://roamio.vercel.app`
   - `TAVILY_API_KEY` *(optional)* — live road/weather conditions (degrades gracefully without it)
   - `SUPABASE_URL`, `SUPABASE_KEY` *(optional)* — trip sharing (degrades gracefully without them)
5. Deploy. Note the URL, e.g. `https://roamio-api-docker.onrender.com`.
6. Test: open `https://roamio-api-docker.onrender.com/health` → `{"status":"ok"}`.

> Both Chroma collections build on first request — the **destinations** index re-embeds
> `corpus.json`, and the **grounding-content** index embeds the committed `corpus/content/*.json`
> (a few seconds total). Render's free tier also spins down after ~15 min idle, so the first
> request after idle is slow (cold start + build). Fine for demos.

(Railway works too: it auto-detects the `Procfile` — just set the same env vars.)

---

## 2. Frontend → Vercel

1. Vercel → **New Project** → import the **same repo**.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Next.js (auto-detected)
3. **Environment variable:**
   - `NEXT_PUBLIC_API_URL` = your Render URL (from step 1.5), e.g. `https://roamio-api-docker.onrender.com`
4. Deploy. Open the Vercel URL.

---

## 3. Connect them (CORS)

Once the Vercel URL exists, set `ALLOWED_ORIGINS` on **Render** to that exact URL and
redeploy the backend. Now the browser can call the API.

> **Verify it, don't assume it.** A CORS misconfiguration is invisible from a terminal —
> `curl` sends no `Origin` header, so the API answers happily while every browser call fails.
> Check the preflight explicitly:
>
> ```bash
> curl -i -X OPTIONS https://<your-api>.onrender.com/generate-itinerary \
>   -H "Origin: https://<your-site>.vercel.app" \
>   -H "Access-Control-Request-Method: POST"
> ```
>
> You want `200` and an `access-control-allow-origin` header echoing your site. `400
> Disallowed CORS origin` means the value doesn't match. Trailing slashes are now stripped
> on our side (browsers send `Origin` without one), but the scheme and subdomain must match
> exactly — `http://` ≠ `https://`, and Vercel preview deployments have their own hostnames.

> On **Vercel**, keep `NEXT_PUBLIC_API_URL` typed as **Config**, not Secret. Anything with
> the `NEXT_PUBLIC_` prefix is compiled into the browser bundle by design, so marking it
> secret implies a privacy it doesn't have — and Vercel won't let you convert a saved secret
> back, you have to delete and recreate it. Env-var changes only apply to **new** builds:
> redeploy after editing.

---

## Auto-deploy

Both Vercel and Render watch your GitHub repo. **Every push to `main` redeploys
both automatically** — exactly the "commit → deploy" loop you wanted.

## Local dev is unchanged

- Backend: `.\venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000`
- Frontend: `cd frontend && pnpm dev` (no env needed — `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`, CORS defaults to localhost)

## Before going public
- Set an **OpenAI spend cap** in the OpenAI dashboard.
- The `.env` and `chroma/` are gitignored — never commit secrets; the index rebuilds on the host.
