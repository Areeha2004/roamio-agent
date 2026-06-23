"""
Roamio RAG — search_destinations() (Chroma-persisted)
=====================================================
Given a free-text query, return the most relevant destinations from the corpus
using semantic (vector) search.

Storage: a PERSISTENT Chroma store on disk (the ./chroma/ folder, gitignored).
Unlike the earlier in-memory FAISS version, the corpus is embedded ONCE and reused
across runs — so you don't pay embedding cost every time you search.

Run the demo:        ./venv/Scripts/python.exe rag/search.py
Rebuild the index:   ./venv/Scripts/python.exe rag/search.py --rebuild
Import it:           from rag.search import search_destinations
"""

import json
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "corpus.json"
PERSIST_DIR = str(Path(__file__).parent.parent / "chroma")
COLLECTION = "destinations"

_embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
_store = None  # cached within a process


def destination_to_text(d):
    """Flatten a destination into the ONE text chunk we embed per destination.
    (Chunking decision: one chunk per destination — the docs are ~200 tokens,
    well under the embedding limit, and each is a single coherent 'place'.)"""
    return (
        f"{d['name']} in {d['region']}, Pakistan. "
        f"{d['description']} "
        f"Vibes: {', '.join(d['tags'])}. "
        f"Best season: {d['best_season']['highlights']} "
        f"Things to do: {', '.join(d['activities'])}. "
        f"Tips: {' '.join(d['tips'])}"
    )


def _index(store):
    """(Re)embed the whole corpus into the store. Uses each destination's id as
    the vector id, and clears existing vectors first so a rebuild reflects the
    current corpus.json exactly (no stale or duplicate entries)."""
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    ids = [d["id"] for d in corpus]
    texts = [destination_to_text(d) for d in corpus]
    metadatas = [
        {"id": d["id"], "name": d["name"], "region": d["region"]}
        for d in corpus
    ]
    existing = store.get()
    if existing["ids"]:
        store.delete(ids=existing["ids"])
    store.add_texts(texts=texts, metadatas=metadatas, ids=ids)
    return len(ids)


def get_store(rebuild=False):
    """Connect to the persistent Chroma store. Embeds the corpus only if the
    store is empty (first run) or rebuild=True; otherwise loads from disk."""
    global _store
    if _store is None or rebuild:
        store = Chroma(
            collection_name=COLLECTION,
            embedding_function=_embeddings,
            persist_directory=PERSIST_DIR,
            # cosine space -> distance in [0,2], lower = closer (matches our
            # similarity intuition from practice/02).
            collection_metadata={"hnsw:space": "cosine"},
        )
        count = len(store.get()["ids"])
        if count == 0 or rebuild:
            n = _index(store)
            print(f"[index] embedded {n} destinations into Chroma  ({PERSIST_DIR})")
        else:
            print(f"[index] loaded {count} destinations from disk — no re-embedding")
        _store = store
    return _store


def search_destinations(query, k=3):
    """Return the top-k destinations most relevant to `query`.
    Each result: {id, name, region, distance}. distance is cosine distance
    (lower = closer). Rank by it; never threshold on its absolute value."""
    store = get_store()
    hits = store.similarity_search_with_score(query, k=k)
    return [
        {
            "id": doc.metadata["id"],
            "name": doc.metadata["name"],
            "region": doc.metadata["region"],
            "distance": round(float(distance), 4),
        }
        for doc, distance in hits
    ]


if __name__ == "__main__":
    rebuild = "--rebuild" in sys.argv
    get_store(rebuild=rebuild)  # build/load once, with a clear log line

    demo_queries = [
        "adventure trekking near Skardu, accessible in July, mid budget",
        "chill family-friendly hills close to Islamabad for a weekend",
        "green valleys and waterfalls, good for a family with kids",
        "where can I see snow and go skiing in winter",
    ]
    for q in demo_queries:
        print(f'\nQuery: "{q}"')
        for r in search_destinations(q, k=3):
            print(f"   {r['distance']:.4f}  {r['name']}  ({r['region']})")
    print("\n(distance = cosine; lower is a closer match. Rank order is what matters.)")
