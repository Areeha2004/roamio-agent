"""
Roamio RAG — destination CONTENT retrieval (grounding for the writer)
====================================================================
A second Chroma collection, separate from the destination *search* index in
``search.py``. This one holds chunked real travel text (Wikivoyage + Wikipedia +
Tavily snippets, ingested by ``corpus/ingest_content.py``) so the itinerary writer can
ground its day-by-day prose in real, citeable sources instead of improvising.

Retrieval is always scoped to ONE destination (filter on dest_id), so a Hunza day only
ever pulls Hunza content.

Rebuild the index:   ./venv/Scripts/python.exe rag/content.py --rebuild
Import it:           from rag.content import search_content
"""

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

ROOT = Path(__file__).parent.parent
CONTENT_DIR = ROOT / "corpus" / "content"
PERSIST_DIR = str(ROOT / "chroma")
COLLECTION = "destination_content"

_embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
_store = None


def _chunk(text, size=1200, overlap=150):
    """Paragraph-aware character chunking. Splits on blank lines, then packs paragraphs
    up to ~`size` chars; over-long paragraphs are hard-split with a little overlap."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(p) > size:
            if buf:
                chunks.append(buf); buf = ""
            for i in range(0, len(p), size - overlap):
                chunks.append(p[i:i + size])
            continue
        if len(buf) + len(p) + 2 > size:
            chunks.append(buf); buf = p
        else:
            buf = f"{buf}\n\n{p}" if buf else p
    if buf:
        chunks.append(buf)
    return [c.strip() for c in chunks if len(c.strip()) > 80]


def _index(store):
    """(Re)embed all cached destination content. Vector id = dest:source:chunk so a
    rebuild replaces cleanly with no duplicates."""
    ids, texts, metadatas = [], [], []
    for f in sorted(CONTENT_DIR.glob("*.json")):
        rec = json.loads(f.read_text(encoding="utf-8"))
        dest_id = rec["dest_id"]
        for si, s in enumerate(rec.get("sources", [])):
            for n, chunk in enumerate(_chunk(s.get("text", ""))):
                ids.append(f"{dest_id}:{s['source']}:{si}:{n}")
                texts.append(chunk)
                metadatas.append({
                    "dest_id": dest_id,
                    "source": s["source"],
                    "title": s.get("title", ""),
                    "url": s.get("url", ""),
                })
    if not ids:
        return 0
    existing = store.get()
    if existing["ids"]:
        store.delete(ids=existing["ids"])
    store.add_texts(texts=texts, metadatas=metadatas, ids=ids)
    return len(ids)


def get_content_store(rebuild=False):
    global _store
    if _store is None or rebuild:
        store = Chroma(
            collection_name=COLLECTION,
            embedding_function=_embeddings,
            persist_directory=PERSIST_DIR,
            collection_metadata={"hnsw:space": "cosine"},
        )
        count = len(store.get()["ids"])
        if count == 0 or rebuild:
            n = _index(store)
            print(f"[content] embedded {n} chunks into Chroma  ({PERSIST_DIR})")
        else:
            print(f"[content] loaded {count} chunks from disk — no re-embedding")
        _store = store
    return _store


def search_content(dest_id, query, k=4):
    """Top-k content chunks for ONE destination, most relevant to `query`.
    Each result: {text, source, title, url, distance}. Returns [] if nothing indexed."""
    try:
        store = get_content_store()
        hits = store.similarity_search_with_score(query, k=k, filter={"dest_id": dest_id})
        return [
            {
                "text": doc.page_content,
                "source": doc.metadata.get("source", ""),
                "title": doc.metadata.get("title", ""),
                "url": doc.metadata.get("url", ""),
                "distance": round(float(distance), 4),
            }
            for doc, distance in hits
        ]
    except Exception:
        return []


if __name__ == "__main__":
    if "--rebuild" in sys.argv:
        get_content_store(rebuild=True)
    print("\nsearch_content('hunza-valley', 'historic forts and lakes to visit'):\n")
    for r in search_content("hunza-valley", "historic forts and lakes to visit", k=3):
        print(f"- [{r['source']}] {r['title']}  (dist {r['distance']})")
        print("  ", r["text"][:160].replace("\n", " "), "...\n")
