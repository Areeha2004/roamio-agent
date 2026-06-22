"""
Roamio RAG — search_destinations()
==================================
The first real product function: given a free-text query, return the most
relevant destinations from the corpus using semantic (vector) search.

This is the FAISS-backed version of the by-hand cosine search you wrote in
practice/02. FAISS is just a fast index over the same vectors — at 5 destinations
you wouldn't notice, but it's the same call you'll make at 15 or 15,000.

Run the demo:   ./venv/Scripts/python.exe rag/search.py
Import it:      from rag.search import search_destinations
"""

import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

CORPUS_PATH = Path(__file__).parent.parent / "corpus" / "corpus.json"

_embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
_store = None  # built once, reused (embedding the corpus has a cost)


def destination_to_text(d):
    """Flatten a destination into the text we embed. What you include here
    determines what semantic search can 'see'. (Same idea as practice/02.)"""
    return (
        f"{d['name']} in {d['region']}, Pakistan. "
        f"{d['description']} "
        f"Vibes: {', '.join(d['tags'])}. "
        f"Best season: {d['best_season']['highlights']} "
        f"Things to do: {', '.join(d['activities'])}. "
        f"Tips: {' '.join(d['tips'])}"
    )


def _load_store():
    """Build the FAISS index from corpus.json (once)."""
    global _store
    if _store is None:
        corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
        texts = [destination_to_text(d) for d in corpus]
        # Metadata travels with each vector so results are useful objects,
        # not just raw text. The agent will read these fields later.
        metadatas = [
            {"id": d["id"], "name": d["name"], "region": d["region"]}
            for d in corpus
        ]
        _store = FAISS.from_texts(texts, _embeddings, metadatas=metadatas)
    return _store


def search_destinations(query, k=3):
    """Return the top-k destinations most relevant to `query`.

    Each result: {id, name, region, distance}. distance is FAISS L2 distance,
    so LOWER = closer match. We rank by it; we never threshold on its absolute
    value (that lesson from practice/02 still holds).
    """
    store = _load_store()
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
    # A spread of queries — note especially the 'chill family' one: with Murree
    # now in the corpus, retrieval has to DISCRIMINATE between vibes, not just
    # return the nearest mountain.
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
    print("\n(distance = L2; lower is a closer match. Rank order is what matters.)")
