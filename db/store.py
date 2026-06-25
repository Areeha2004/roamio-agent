"""
Roamio — trip persistence (Supabase)
====================================
Saves generated itineraries so they get a shareable link, and loads them back by id.

Graceful by design: if SUPABASE_URL / SUPABASE_KEY aren't set, save_trip() returns
None (no share id) and get_trip() returns None — so local dev and the deployed app
both run fine without Supabase configured.

Create the table once in the Supabase SQL editor:

    create table trips (
      id text primary key,
      constraints jsonb,
      itinerary jsonb,
      created_at timestamptz default now()
    );

Use the project's SERVICE ROLE key as SUPABASE_KEY (backend-only secret) so writes
bypass row-level security without extra policies.
"""

import os
import secrets
from dotenv import load_dotenv

load_dotenv()

_client = None


def _get_client():
    """Lazily build the Supabase client, or return None if not configured."""
    global _client
    if _client is not None:
        return _client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    if not url or not key or "your-" in url:
        return None  # not configured — caller degrades gracefully
    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except Exception:
        return None


def save_trip(request, itinerary):
    """Persist a trip; return a short URL-safe share id, or None if unconfigured/failed."""
    client = _get_client()
    if client is None:
        return None
    share_id = secrets.token_urlsafe(8)
    try:
        client.table("trips").insert({
            "id": share_id,
            "constraints": request,
            "itinerary": itinerary,
        }).execute()
        return share_id
    except Exception:
        return None


def get_trip(share_id):
    """Load a saved itinerary by share id, or None if missing/unconfigured."""
    client = _get_client()
    if client is None:
        return None
    try:
        res = client.table("trips").select("itinerary").eq("id", share_id).limit(1).execute()
        if res.data:
            return res.data[0]["itinerary"]
    except Exception:
        return None
    return None
