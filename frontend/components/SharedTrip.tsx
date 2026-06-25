"use client";

import { useEffect, useState } from "react";
import { adaptItinerary, ItineraryPage } from "./RoamioApp";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Loads a saved itinerary by its share id and renders it read-only.
export default function SharedTrip({ id }: { id: string }) {
  const [trip, setTrip] = useState<ReturnType<typeof adaptItinerary> | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch(`${API_URL}/trip/${id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setTrip(adaptItinerary(data)); setState("ready"); })
      .catch(() => setState("error"));
  }, [id]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading trip…
      </div>
    );
  }
  if (state === "error" || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Trip not found</p>
        <a href="/" className="text-sm underline text-muted-foreground">Plan your own trip →</a>
      </div>
    );
  }

  const goHome = () => { window.location.href = "/"; };
  return <ItineraryPage trip={trip} onTweak={goHome} onNewTrip={goHome} />;
}
