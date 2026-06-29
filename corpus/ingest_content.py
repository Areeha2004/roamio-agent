"""
Roamio — destination content ingestion
======================================
Builds the GROUNDING corpus for the RAG writer: for each destination it pulls real
travel text from Wikivoyage (actual travel guides) + Wikipedia (factual base), tops it
up with a few fresh Tavily web snippets, and caches everything to
``corpus/content/<id>.json``.

This is the OFFLINE step. Embedding/indexing happens separately in ``rag/content.py``
(reads these cached files), so re-embeds are reproducible and don't re-hit the network.

Resilient by design: any source that fails (404, no key, network) is skipped; a
destination keeps whatever sources succeeded.

Run:  ./venv/Scripts/python.exe corpus/ingest_content.py            # all destinations
      ./venv/Scripts/python.exe corpus/ingest_content.py hunza-valley skardu   # a subset
"""

import json
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from web_search import web_search  # Tavily wrapper (returns [] without a key)

CORPUS = json.loads((ROOT / "corpus" / "corpus.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "corpus" / "content"
OUT_DIR.mkdir(exist_ok=True)

UA = {"User-Agent": "RoamioBot/1.0 (https://github.com/Areeha2004/roamio-agent; dev@33d.co)"}
MAX_CHARS_PER_SOURCE = 8000  # keep each article to a sensible length before chunking


def _mediawiki(api_base, site_base, query):
    """Resolve the best page for `query` via search, then return its plaintext extract
    as {source-less} {title, url, text}. None on any miss/failure."""
    try:
        # 1) search for the most relevant page title
        s = requests.get(api_base, headers=UA, timeout=20, params={
            "action": "query", "list": "search", "srsearch": query,
            "srlimit": 1, "format": "json",
        }).json()
        hits = s.get("query", {}).get("search", [])
        if not hits:
            return None
        title = hits[0]["title"]

        # 2) fetch the plain-text extract for that title (follow redirects)
        e = requests.get(api_base, headers=UA, timeout=20, params={
            "action": "query", "prop": "extracts", "explaintext": 1,
            "titles": title, "redirects": 1, "format": "json",
        }).json()
        pages = e.get("query", {}).get("pages", {})
        if not pages:
            return None
        page = next(iter(pages.values()))
        text = (page.get("extract") or "").strip()
        if len(text) < 200:  # a stub / disambiguation page is not useful grounding
            return None
        url = f"{site_base}/wiki/{title.replace(' ', '_')}"
        return {"title": title, "url": url, "text": text[:MAX_CHARS_PER_SOURCE]}
    except Exception:
        return None


def _clean_web(text):
    return " ".join((text or "").split())


def ingest_one(dest):
    name, region = dest["name"], dest["region"]
    q = f"{name} Pakistan"
    sources = []

    wv = _mediawiki("https://en.wikivoyage.org/w/api.php", "https://en.wikivoyage.org", q)
    if wv:
        sources.append({"source": "wikivoyage", **wv})

    wp = _mediawiki("https://en.wikipedia.org/w/api.php", "https://en.wikipedia.org", q)
    if wp:
        sources.append({"source": "wikipedia", **wp})

    # Tavily top-up — a few fresh snippets (skipped automatically without a key)
    for r in web_search(f"{name} {region} Pakistan travel guide things to do and see", max_results=4):
        content = _clean_web(r.get("content"))
        if len(content) > 120:
            sources.append({
                "source": "web",
                "title": r.get("title", "")[:120],
                "url": r.get("url", ""),
                "text": content[:1500],
            })

    record = {"dest_id": dest["id"], "name": name, "sources": sources}
    (OUT_DIR / f"{dest['id']}.json").write_text(
        json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    tag = ", ".join(f"{s['source']}({len(s['text'])}c)" for s in sources) or "NONE"
    print(f"  {dest['id']:18} -> {tag}")
    return len(sources)


def main(ids=None):
    targets = [d for d in CORPUS if not ids or d["id"] in ids]
    print(f"Ingesting content for {len(targets)} destination(s) -> {OUT_DIR}")
    total = 0
    for d in targets:
        total += ingest_one(d)
        time.sleep(0.4)  # be polite to the MediaWiki APIs
    print(f"Done. {total} source documents cached across {len(targets)} destinations.")


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
