"use client";

import { useState, useEffect, useRef } from "react";
import {
  MapPin, Calendar, Users, Camera, Mountain,
  Compass, Check, ArrowRight, ChevronDown, ChevronUp, Minus, Plus,
  AlertTriangle, Sun, Share2, Edit3, Sparkles, Clock, Wallet,
  Navigation, Coffee, Tent, Church, Wind, Leaf, Fuel, Plane
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Page = "landing" | "planner" | "loading" | "itinerary" | "error";
type GroupType = "Solo" | "Couple" | "Friends" | "Family";
type VibeType = "Adventure" | "Chill" | "Photography" | "Religious";

interface PlanForm {
  days: number;
  budget: number;
  startCity: string;
  groupType: GroupType | null;
  vibe: VibeType | null;
  month: number;
  stayStyle: "budget" | "standard" | "luxury";
}

// ─── Palette constants ────────────────────────────────────────────────────────
const P = {
  carbonBlack: "#1a1f16",
  blackForest: "#1e3f20",
  hunterGreen: "#345830",
  fern: "#4a7856",
  aquamarine: "#94ecbe",
  lightBlue: "#c4e5eb",
  amberHoney: "#f1a809",
};

// ─── Sample Itinerary Data ────────────────────────────────────────────────────
const SAMPLE_TRIP = {
  title: "Northern Escape: Hunza & Beyond",
  days: 5,
  startCity: "Islamabad",
  groupType: "Friends",
  vibe: "Adventure",
  totalCost: 112500,
  perDayCost: 22500,
  accommodation: 47500,
  food: 27000,
  localTransport: 18000,
  fuel: 20000,
  stayStyle: "Standard",
  bestSeason: "May – September",
  currentSeasonWarning: "June is peak season — book accommodation 2–3 weeks in advance.",
  permitRequired: true,
  permitNote: "NOC permit required for Gilgit-Baltistan (Hunza & upper KKH). Apply online via the Ministry of Interior portal at least 10–14 days before departure.",
  liveConditions: ["Karakoram Highway is open and clear", "Pleasant summer weather expected in the valleys"],
  shareId: "",
  heroImage: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Hunza_Valley_HDR.jpg/1280px-Hunza_Valley_HDR.jpg",
  destinationNames: ["Hunza Valley", "Skardu"],
  routeSummary: {
    legs: [
      { from: "Islamabad", to: "Naran", hours: 9, via: "via Mansehra & Balakot" },
      { from: "Naran", to: "Hunza", hours: 8, via: "via Babusar Pass & the KKH" },
    ],
    roundTripHours: 36,
  },
  tips: ["Carry cash — ATMs are scarce up north", "Book stays ahead in peak season", "Pack warm layers even in summer"],
  days_data: [
    {
      day: 1,
      destination: "Islamabad",
      emoji: "🏙️",
      tagline: "Gateway to the North",
      activities: [
        "Faisal Mosque at golden hour",
        "Lok Virsa Museum & cultural exhibits",
        "F-7 Markaz street food crawl",
        "Evening at Monal Restaurant with city views",
      ],
      estimatedCost: 18000,
      highlight: "Monal Restaurant views",
      season: "Year-round",
    },
    {
      day: 2,
      destination: "Naran → Babusar Top",
      emoji: "🏔️",
      tagline: "KKH begins",
      activities: [
        "Depart Islamabad at dawn via N-35",
        "Lulusar Lake stop & picnic",
        "Saif-ul-Muluk Lake at dusk (3km hike)",
        "Overnight in Naran guesthouse",
      ],
      estimatedCost: 22000,
      highlight: "Saif-ul-Muluk Lake",
      season: "Jun – Sep",
    },
    {
      day: 3,
      destination: "Hunza Valley",
      emoji: "🌸",
      tagline: "Heaven on Earth",
      activities: [
        "Attabad Lake turquoise boat ride",
        "Baltit Fort (1000-year-old Karimabad fort)",
        "Eagle's Nest viewpoint at sunset",
        "Local bazaar & dried apricot shopping",
      ],
      estimatedCost: 24000,
      highlight: "Attabad Lake boat ride",
      season: "Apr – Oct",
    },
    {
      day: 4,
      destination: "Skardu",
      emoji: "🏜️",
      tagline: "Roof of the World",
      activities: [
        "Upper Kachura Lake morning walk",
        "Shangrila Resort",
        "Katpana Cold Desert (high-altitude desert)",
        "Skardu Fort ancient rock throne",
      ],
      estimatedCost: 26000,
      highlight: "Katpana Desert dunes",
      season: "May – Sep",
    },
    {
      day: 5,
      destination: "Return to Islamabad",
      emoji: "✈️",
      tagline: "Memories packed",
      activities: [
        "PIA or Serene Air morning flight from Skardu",
        "Islamabad stopover & souvenir shopping",
        "Debrief dinner at local desi restaurant",
        "Depart with a lifetime of stories",
      ],
      estimatedCost: 22500,
      highlight: "Aerial views of Karakoram",
      season: "Year-round",
    },
  ],
};

// ─── Backend wiring ───────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Map the backend itinerary JSON (ITINERARY_SCHEMA) to the shape ItineraryPage renders.
// Numbers/facts come straight from the API; a few display-only fields are derived.
export function adaptItinerary(api: any): typeof SAMPLE_TRIP {
  const req = api.request;
  const cb = api.cost_breakdown_pkr;
  const totalCost = api.summary.total_cost_pkr;  // single number (tier-based)
  const perDay = Math.round(totalCost / Math.max(1, req.days));
  const warn = (t: string) => api.warnings.find((w: any) => w.type === t);
  const permit = warn("permit");

  return {
    title: api.summary.title,
    days: req.days,
    startCity: req.start_city,
    groupType: cap(req.group_type),
    vibe: cap(req.vibe),
    totalCost,
    perDayCost: perDay,
    accommodation: cb.hotels,
    food: cb.food,
    localTransport: cb.local_transport,
    fuel: cb.fuel,
    stayStyle: cap(req.style || "standard"),
    bestSeason: api.summary.feasible ? "In season for your dates" : "Check seasonal access",
    currentSeasonWarning: (warn("season")?.text || warn("info")?.text || ""),
    liveConditions: api.warnings.filter((w: any) => w.type === "live").map((w: any) => w.text),
    permitRequired: !!permit,
    permitNote: permit?.text || "",
    shareId: api.meta?.share_id || "",
    heroImage: api.summary.hero_image || "",
    destinationNames: api.summary.destination_names || [],
    routeSummary: {
      legs: (api.route_summary?.legs || []).map((l: any) => ({ from: l.from, to: l.to, hours: l.hours, via: l.via })),
      roundTripHours: api.route_summary?.round_trip_hours || 0,
    },
    tips: api.tips || [],
    days_data: api.days.map((d: any) => ({
      day: d.day,
      destination: d.title,
      emoji: d.type === "travel" ? "🚗" : "🏔️",
      tagline: d.type === "travel" ? "On the road" : "Exploring",
      activities: d.activities.length ? d.activities : [d.notes],
      estimatedCost: perDay,
      highlight: d.activities[0] || d.notes,
      season: "",
    })),
  };
}

// Interpret a free-text tweak ("+2 days", "make it cheaper", "focus on photography")
// as changes to the original form, then re-plan. Unknown tweaks just re-run as-is.
function applyTweak(form: PlanForm, tweak: string): PlanForm {
  const t = tweak.toLowerCase();
  const f: PlanForm = { ...form };
  const add = t.match(/(?:\+|add\s*)(\d+)\s*day/);
  if (add) f.days = Math.min(30, f.days + parseInt(add[1]));
  else if (/rest day|extra day|add a day|one more day/.test(t)) f.days = Math.min(30, f.days + 1);
  else if (/longer|more days/.test(t)) f.days = Math.min(30, f.days + 2);
  const sub = t.match(/(?:-|remove\s*|fewer\s*)(\d+)\s*day/);
  if (sub) f.days = Math.max(1, f.days - parseInt(sub[1]));
  else if (/shorter|fewer days/.test(t)) f.days = Math.max(1, f.days - 2);
  if (/cheaper|lower budget|less expensive|reduce budget/.test(t)) f.budget = Math.max(10000, Math.round(f.budget * 0.8));
  if (/luxur|premium|higher budget|more comfort/.test(t)) f.budget = Math.round(f.budget * 1.3);
  if (/photograph/.test(t)) f.vibe = "Photography";
  if (/adventur/.test(t)) f.vibe = "Adventure";
  if (/chill|relax/.test(t)) f.vibe = "Chill";
  if (/religious|spiritual/.test(t)) f.vibe = "Religious";
  return f;
}

const CITIES = [
  "Islamabad", "Lahore", "Karachi", "Peshawar",
  "Quetta", "Multan", "Faisalabad", "Gilgit",
];

const GROUP_TYPES: { label: GroupType; icon: string }[] = [
  { label: "Solo", icon: "🧳" },
  { label: "Couple", icon: "💑" },
  { label: "Friends", icon: "👥" },
  { label: "Family", icon: "👨‍👩‍👧" },
];

const VIBES: { label: VibeType; icon: typeof Mountain; desc: string }[] = [
  { label: "Adventure", icon: Mountain, desc: "Treks & peaks" },
  { label: "Chill", icon: Wind, desc: "Relax & unwind" },
  { label: "Photography", icon: Camera, desc: "Capture every frame" },
  { label: "Religious", icon: Church, desc: "Spiritual journey" },
];

const STAY_STYLES = [
  { value: "budget" as const, label: "Budget", hint: "~PKR 3–5k/night" },
  { value: "standard" as const, label: "Standard", hint: "~PKR 7–10k/night" },
  { value: "luxury" as const, label: "Luxury", hint: "~PKR 12–18k/night" },
];

// ─── Utility ─────────────────────────────────────────────────────────────────
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatPKR = (n: number) => "PKR " + n.toLocaleString("en-PK");

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({
  onLogoClick,
  onPlanClick,
  dark = false,
}: {
  onLogoClick: () => void;
  onPlanClick: () => void;
  dark?: boolean;
}) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={
        dark
          ? { background: "transparent" }
          : { background: "rgba(239,247,242,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }
      }
    >
      <div className="max-w-6xl mx-auto px-8 h-18 flex items-center justify-between" style={{ height: 72 }}>
        <button onClick={onLogoClick} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: P.aquamarine }}>
            <Compass size={15} style={{ color: P.carbonBlack }} />
          </div>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "Sora, sans-serif", color: dark ? "#fff" : P.carbonBlack }}
          >
            Roamio
          </span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {["About", "Gallery", "Testimonials", "Blog"].map(l => (
            <button
              key={l}
              onClick={onLogoClick}
              className="text-sm transition-colors"
              style={{ color: dark ? "rgba(255,255,255,0.65)" : "var(--muted-foreground)" }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="hidden md:block text-sm font-medium transition-colors"
            style={{ color: dark ? "rgba(255,255,255,0.75)" : P.fern }}
          >
            Sign in
          </button>
          <button
            onClick={onPlanClick}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg active:scale-95 transition-all duration-150 flex items-center gap-1.5"
            style={{
              background: dark ? P.aquamarine : P.fern,
              color: dark ? P.carbonBlack : "#fff",
              fontFamily: "Sora, sans-serif",
            }}
          >
            Plan a Trip
          </button>
        </div>
      </div>
    </nav>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onPlanClick }: { onPlanClick: () => void }) {
  const [quickCity, setQuickCity] = useState("Islamabad");
  const [quickDays, setQuickDays] = useState(5);
  const [quickGroup, setQuickGroup] = useState("Friends");

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero: full-bleed photo with overlaid text + bottom search bar ── */}
      <section className="relative h-screen min-h-[640px] overflow-hidden">

        {/* Full-bleed background photo */}
        <img
          src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1800&h=1100&fit=crop&auto=format&q=85"
          alt="Stunning mountain valley landscape in northern Pakistan"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Layered overlay: left-heavy dark vignette for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(26,31,22,0.78) 0%, rgba(26,31,22,0.45) 45%, rgba(26,31,22,0.15) 100%)",
          }}
        />
        {/* Subtle bottom darkening to ground the search bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-56 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(26,31,22,0.55) 0%, transparent 100%)" }}
        />

        {/* Hero content */}
        <div className="relative h-full flex flex-col justify-between">
          {/* Upper text block */}
          <div className="flex items-center flex-1 pb-36">
            <div className="max-w-6xl mx-auto px-8 w-full pt-20">
              <div
                className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 mb-7"
                style={{ borderColor: `${P.aquamarine}40`, background: `${P.aquamarine}14` }}
              >
                <Leaf size={12} style={{ color: P.aquamarine }} />
                <span
                  className="text-xs font-semibold tracking-[0.16em] uppercase"
                  style={{ color: P.aquamarine }}
                >
                  AI-Powered Pakistan Travel
                </span>
              </div>

              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-5 max-w-2xl"
                style={{ fontFamily: "Sora, sans-serif" }}
              >
                Wander Pakistan.<br />
                <span style={{ color: P.aquamarine }}>Beyond</span><br />
                Boundaries.
              </h1>

              <p className="text-white/65 text-lg leading-relaxed max-w-md mb-8">
                Tell Roamio your days, budget and vibe — get a full day-by-day Pakistan trip plan in seconds.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={onPlanClick}
                  className="inline-flex items-center gap-2.5 font-bold text-sm px-7 py-3.5 rounded-xl active:scale-95 transition-all duration-150"
                  style={{
                    background: P.aquamarine,
                    color: P.carbonBlack,
                    fontFamily: "Sora, sans-serif",
                    boxShadow: `0 8px 28px ${P.aquamarine}35`,
                  }}
                >
                  Explore Now <ArrowRight size={16} />
                </button>

                {/* Social proof pill */}
                <div
                  className="hidden md:flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <div className="flex -space-x-1.5">
                    {["#2d6a4f", "#40916c", "#52b788", "#74c69d"].map((c, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full border-2"
                        style={{ background: c, borderColor: "rgba(255,255,255,0.3)" }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-white/70">
                    <span className="text-white font-semibold">2,400+</span> trips planned
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom quick-search bar ── */}
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-0">
            <div className="max-w-5xl mx-auto">
              <div
                className="rounded-t-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.97)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 -4px 40px rgba(26,31,22,0.2)",
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">

                  {/* Location */}
                  <div className="px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      Starting City
                    </p>
                    <div className="relative">
                      <MapPin size={13} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <select
                        value={quickCity}
                        onChange={e => setQuickCity(e.target.value)}
                        className="w-full pl-5 bg-transparent text-sm font-semibold text-foreground focus:outline-none appearance-none cursor-pointer"
                        style={{ fontFamily: "Sora, sans-serif" }}
                      >
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Days */}
                  <div className="px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      Duration
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuickDays(d => Math.max(1, d - 1))}
                        className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="text-sm font-bold text-foreground flex-1 text-center" style={{ fontFamily: "Sora, sans-serif" }}>
                        {quickDays} {quickDays === 1 ? "day" : "days"}
                      </span>
                      <button
                        onClick={() => setQuickDays(d => Math.min(30, d + 1))}
                        className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Group */}
                  <div className="px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      Travelling As
                    </p>
                    <div className="relative">
                      <Users size={13} className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <select
                        value={quickGroup}
                        onChange={e => setQuickGroup(e.target.value)}
                        className="w-full pl-5 bg-transparent text-sm font-semibold text-foreground focus:outline-none appearance-none cursor-pointer"
                        style={{ fontFamily: "Sora, sans-serif" }}
                      >
                        {["Solo", "Couple", "Friends", "Family"].map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="px-4 py-4 flex items-center">
                    <button
                      onClick={onPlanClick}
                      className="w-full h-full min-h-[52px] font-bold text-sm rounded-xl active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                      style={{
                        background: P.fern,
                        color: "#fff",
                        fontFamily: "Sora, sans-serif",
                        boxShadow: `0 4px 16px ${P.fern}40`,
                      }}
                    >
                      <Sparkles size={15} />
                      Plan My Trip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span
              className="text-xs font-bold tracking-[0.18em] uppercase mb-3 block"
              style={{ color: P.fern }}
            >
              How Roamio works
            </span>
            <h2
              className="text-3xl md:text-4xl font-bold text-foreground"
              style={{ fontFamily: "Sora, sans-serif" }}
            >
              From vibe to verified itinerary<br className="hidden md:block" /> in under 30 seconds
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: Edit3,
                title: "Tell us your plan",
                desc: "Choose your days, budget in PKR, starting city, travel companions, and trip vibe. No signup required.",
                bg: `${P.aquamarine}25`,
                iconColor: P.hunterGreen,
              },
              {
                step: "02",
                icon: Sparkles,
                title: "AI builds your itinerary",
                desc: "Our AI synthesizes local knowledge — routes, permits, season warnings, hidden gems — into a structured day-by-day plan.",
                bg: `${P.fern}18`,
                iconColor: P.fern,
              },
              {
                step: "03",
                icon: Share2,
                title: "Share or tweak it",
                desc: "Copy a shareable link, ask Roamio to make it cheaper, add days, or change the vibe — it adapts instantly.",
                bg: `${P.lightBlue}50`,
                iconColor: "#2a7fa5",
              },
            ].map(({ step, icon: Icon, title, desc, bg, iconColor }) => (
              <div
                key={step}
                className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: bg }}
                >
                  <Icon size={20} style={{ color: iconColor }} />
                </div>
                <div
                  className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2 uppercase"
                  style={{ fontFamily: "DM Mono, monospace" }}
                >
                  Step {step}
                </div>
                <h3
                  className="text-base font-bold text-foreground mb-3"
                  style={{ fontFamily: "Sora, sans-serif" }}
                >
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Destinations ── */}
      <section className="py-24 px-6" style={{ background: `${P.aquamarine}10` }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span
                className="text-xs font-bold tracking-[0.18em] uppercase mb-3 block"
                style={{ color: P.fern }}
              >
                Dreaming of Pakistan
              </span>
              <h2
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: "Sora, sans-serif" }}
              >
                Where do you want to go?
              </h2>
            </div>
            <button
              onClick={onPlanClick}
              className="flex-shrink-0 text-sm font-semibold flex items-center gap-1.5 transition-colors"
              style={{ color: P.fern }}
            >
              Plan any destination <ArrowRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Hunza Valley", region: "Gilgit-Baltistan", img: "photo-1558618666-fcd25c85cd64", tag: "Most Loved", season: "Apr – Oct", days: "4–7 days" },
              { name: "Skardu", region: "Gilgit-Baltistan", img: "photo-1586348943529-beaae6c28db9", tag: "Adventure Hub", season: "May – Sep", days: "3–5 days" },
              { name: "Naran & Kaghan", region: "Khyber Pakhtunkhwa", img: "photo-1464822759023-fed622ff2c3b", tag: "Family Favourite", season: "Jun – Sep", days: "2–4 days" },
            ].map(({ name, region, img, tag, season, days }) => (
              <button
                key={name}
                onClick={onPlanClick}
                className="group text-left bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="relative h-52 overflow-hidden bg-muted">
                  <img
                    src={`https://images.unsplash.com/${img}?w=600&h=400&fit=crop&auto=format`}
                    alt={name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,31,22,0.45) 0%, transparent 60%)" }} />
                  <span
                    className="absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                    style={{ background: P.aquamarine, color: P.carbonBlack }}
                  >
                    {tag}
                  </span>
                </div>
                <div className="p-5">
                  <h3
                    className="text-base font-bold text-foreground mb-0.5"
                    style={{ fontFamily: "Sora, sans-serif" }}
                  >
                    {name}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">{region}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Sun size={12} style={{ color: P.amberHoney }} /> {season}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} style={{ color: P.fern }} /> {days}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="rounded-3xl px-8 py-16 relative overflow-hidden"
            style={{ background: P.blackForest }}
          >
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: "radial-gradient(circle, #94ecbe 1.5px, transparent 1.5px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div
              className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none opacity-15"
              style={{ background: `radial-gradient(circle, ${P.aquamarine}, transparent 70%)`, transform: "translate(30%, -30%)" }}
            />
            <div className="relative">
              <h2
                className="text-3xl md:text-4xl font-bold text-white mb-4"
                style={{ fontFamily: "Sora, sans-serif" }}
              >
                Pakistan is waiting.<br />Your itinerary isn't.
              </h2>
              <p className="mb-8 text-lg" style={{ color: "rgba(255,255,255,0.55)" }}>
                Free, instant, no signup needed.
              </p>
              <button
                onClick={onPlanClick}
                className="inline-flex items-center gap-3 font-bold text-base px-8 py-4 rounded-xl active:scale-95 transition-all duration-150"
                style={{
                  background: P.aquamarine,
                  color: P.carbonBlack,
                  fontFamily: "Sora, sans-serif",
                  boxShadow: `0 8px 28px ${P.aquamarine}35`,
                }}
              >
                Plan My Trip Now
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: P.aquamarine }}>
              <Compass size={12} style={{ color: P.carbonBlack }} />
            </div>
            <span className="text-sm font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Roamio</span>
          </div>
          <p className="text-xs text-muted-foreground">
            AI-powered Pakistan trip planning. Built with love for Pakistani travel.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Planner Page ─────────────────────────────────────────────────────────────
function PlannerPage({ onSubmit }: { onSubmit: (form: PlanForm) => void }) {
  const [form, setForm] = useState<PlanForm>({
    days: 5,
    budget: 75000,
    startCity: "Islamabad",
    groupType: null,
    vibe: null,
    month: 7,
    stayStyle: "standard",
  });
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    const errs: string[] = [];
    if (!form.groupType) errs.push("Please select a group type.");
    if (!form.vibe) errs.push("Please select a trip vibe.");
    if (form.budget < 5000 * form.days)
      errs.push(`Budget too low for ${form.days} days. Minimum PKR ${(5000 * form.days).toLocaleString()}.`);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    onSubmit(form);
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="mb-10">
          <span
            className="text-xs font-bold tracking-[0.18em] uppercase mb-3 block"
            style={{ color: P.fern }}
          >
            Trip Planner
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold text-foreground mb-3"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            Plan your Pakistan trip
          </h1>
          <p className="text-muted-foreground">
            Fill in a few details and Roamio builds you a full day-by-day itinerary in seconds.
          </p>
        </div>

        <div className="space-y-6">
          {/* Days */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              How many days?
            </label>
            <p className="text-xs text-muted-foreground mb-5">Roamio works best for 3–14 day trips.</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setForm(f => ({ ...f, days: Math.max(1, f.days - 1) }))}
                className="w-10 h-10 rounded-xl border border-border bg-muted flex items-center justify-center hover:border-primary/40 transition-colors"
              >
                <Minus size={16} />
              </button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
                  {form.days}
                </span>
                <span className="text-muted-foreground text-sm ml-2">days</span>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, days: Math.min(30, f.days + 1) }))}
                className="w-10 h-10 rounded-xl border border-border bg-muted flex items-center justify-center hover:border-primary/40 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Budget */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Total trip budget
            </label>
            <p className="text-xs text-muted-foreground mb-4">For your whole group and the entire trip — covers stays, food, and road travel within Pakistan. Flights to your start city are not included.</p>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-muted-foreground font-medium">PKR</span>
              <input
                type="number"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: Number(e.target.value) }))}
                className="flex-1 bg-input-background border border-border rounded-xl px-4 py-3 text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:border-primary transition-all"
                style={{ fontFamily: "DM Mono, monospace" }}
                min={10000}
                max={5000000}
                step={5000}
              />
            </div>
            <input
              type="range"
              min={10000}
              max={500000}
              step={5000}
              value={form.budget}
              onChange={e => setForm(f => ({ ...f, budget: Number(e.target.value) }))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span>PKR 10,000</span>
              <span className="font-semibold" style={{ color: P.fern }}>
                ≈ {formatPKR(Math.round(form.budget / form.days))} / day
              </span>
              <span>PKR 5,00,000</span>
            </div>
          </div>

          {/* Stay style */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Where will you stay?
            </label>
            <p className="text-xs text-muted-foreground mb-4">Sets your hotel & food level — drives the cost estimate.</p>
            <div className="grid grid-cols-3 gap-3">
              {STAY_STYLES.map(({ value, label, hint }) => (
                <button
                  key={value}
                  onClick={() => setForm(f => ({ ...f, stayStyle: value }))}
                  className="flex flex-col items-start gap-1 px-3 py-3 rounded-xl border-2 text-left transition-all duration-150"
                  style={{
                    borderColor: form.stayStyle === value ? P.fern : "var(--border)",
                    background: form.stayStyle === value ? `${P.fern}12` : "var(--muted)",
                  }}
                >
                  <span className="text-sm font-semibold" style={{ color: form.stayStyle === value ? P.hunterGreen : "var(--foreground)", fontFamily: "Sora, sans-serif" }}>{label}</span>
                  <span className="text-[10px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start City */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Starting city
            </label>
            <p className="text-xs text-muted-foreground mb-4">Where your trip begins.</p>
            <div className="relative">
              <MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select
                value={form.startCity}
                onChange={e => setForm(f => ({ ...f, startCity: e.target.value }))}
                className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:border-primary transition-all appearance-none"
              >
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Travel Month */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              When are you travelling?
            </label>
            <p className="text-xs text-muted-foreground mb-4">Used to check seasonal access — some valleys close in winter.</p>
            <div className="relative">
              <Calendar size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:border-primary transition-all appearance-none"
              >
                {["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Group Type */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Who's travelling?
            </label>
            <p className="text-xs text-muted-foreground mb-4">Affects accommodation, activity, and pace recommendations.</p>
            <div className="grid grid-cols-2 gap-3">
              {GROUP_TYPES.map(({ label, icon }) => (
                <button
                  key={label}
                  onClick={() => setForm(f => ({ ...f, groupType: label }))}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all duration-150"
                  style={{
                    borderColor: form.groupType === label ? P.fern : "var(--border)",
                    background: form.groupType === label ? `${P.fern}12` : "var(--muted)",
                    color: form.groupType === label ? P.hunterGreen : "var(--foreground)",
                    fontFamily: "Sora, sans-serif",
                  }}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Vibe */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Trip vibe
            </label>
            <p className="text-xs text-muted-foreground mb-4">Choose what matters most to you.</p>
            <div className="grid grid-cols-2 gap-3">
              {VIBES.map(({ label, icon: Icon, desc }) => (
                <button
                  key={label}
                  onClick={() => setForm(f => ({ ...f, vibe: label }))}
                  className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl border-2 text-left transition-all duration-150"
                  style={{
                    borderColor: form.vibe === label ? P.fern : "var(--border)",
                    background: form.vibe === label ? `${P.fern}12` : "var(--muted)",
                  }}
                >
                  <Icon size={18} style={{ color: form.vibe === label ? P.fern : "var(--muted-foreground)" }} />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: form.vibe === label ? P.hunterGreen : "var(--foreground)", fontFamily: "Sora, sans-serif" }}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {e}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            className="w-full font-bold text-lg py-5 rounded-2xl active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-3"
            style={{
              background: P.fern,
              color: "#fff",
              fontFamily: "Sora, sans-serif",
              boxShadow: `0 10px 28px ${P.fern}35`,
            }}
          >
            <Sparkles size={20} />
            Plan My Trip
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Takes about 15 seconds · No signup required
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Page ─────────────────────────────────────────────────────────────
function LoadingPage({ status }: { status?: string }) {
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const steps = [
    "Mapping your route across Pakistan...",
    "Calculating road distances & transit times...",
    "Checking seasonal conditions & permits...",
    "Sourcing accommodation options...",
    "Crafting your day-by-day plan...",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 95) { clearInterval(interval); return 95; }
        return p + Math.random() * 6;
      });
    }, 400);
    const stepInterval = setInterval(() => {
      setStep(s => (s + 1) % steps.length);
    }, 2800);
    return () => { clearInterval(interval); clearInterval(stepInterval); };
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 pt-16">
      <div className="max-w-md w-full text-center">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="w-20 h-20 rounded-full border-4 border-muted" />
          <div
            className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: `${P.aquamarine} transparent transparent transparent`, animationDuration: "1.1s" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Compass size={26} style={{ color: P.fern }} />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "Sora, sans-serif" }}>
          Planning your trip...
        </h2>
        <p className="text-muted-foreground text-sm mb-8">This usually takes about 15 seconds</p>

        <div className="bg-muted rounded-full h-2 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 95)}%`, background: P.aquamarine }}
          />
        </div>
        <p className="text-sm text-muted-foreground min-h-[20px] mb-8 transition-all">{status || steps[step]}</p>

        <div className="flex items-center justify-center gap-2">
          {["ISB", "NAR", "HNZ", "SKD"].map((city, i) => (
            <div key={city} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1" style={{ opacity: progress > i * 25 ? 1 : 0.3 }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{ background: progress > i * 25 ? P.fern : "var(--muted)" }}
                >
                  <MapPin size={13} style={{ color: progress > i * 25 ? "#fff" : "var(--muted-foreground)" }} />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase" style={{ fontFamily: "DM Mono, monospace" }}>{city}</span>
              </div>
              {i < 3 && (
                <div
                  className="w-6 h-px mb-5 transition-all duration-500"
                  style={{ background: progress > (i + 1) * 25 ? P.aquamarine : "var(--muted)" }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Itinerary Page ───────────────────────────────────────────────────────────
export function ItineraryPage({ trip, onTweak, onNewTrip }: { trip: typeof SAMPLE_TRIP; onTweak: (tweak: string) => void; onNewTrip: () => void }) {
  const [copied, setCopied] = useState(false);
  const [tweakInput, setTweakInput] = useState("");
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  // `trip` arrives as a prop — live API data, or SAMPLE_TRIP before a search runs.

  const handleCopy = () => {
    const url = trip.shareId
      ? `${window.location.origin}/trip/${trip.shareId}`
      : window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Hero image */}
        {trip.heroImage && (
          <div className="rounded-2xl overflow-hidden mb-6 h-44 md:h-60 bg-muted">
            <img
              src={trip.heroImage}
              alt={trip.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
            />
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: P.fern }}>Your Itinerary</span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground">Generated just now</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2" style={{ fontFamily: "Sora, sans-serif" }}>
            {trip.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {[
              { icon: Calendar, text: `${trip.days} days` },
              { icon: MapPin, text: `From ${trip.startCity}` },
              { icon: Users, text: trip.groupType },
              { icon: Mountain, text: trip.vibe },
              { icon: Tent, text: `${trip.stayStyle} stay` },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon size={13} style={{ color: P.fern }} />
                {text}
              </span>
            ))}
          </div>
        </div>

        {/* Cost Summary */}
        <div
          className="rounded-2xl p-6 mb-4"
          style={{ background: P.blackForest }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={15} style={{ color: P.aquamarine }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: `${P.aquamarine}90` }}>
              Cost Breakdown
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-3xl font-bold text-white mb-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                {formatPKR(trip.totalCost)}
              </div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Total estimate</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-0.5" style={{ fontFamily: "DM Mono, monospace", color: P.aquamarine }}>
                {formatPKR(trip.perDayCost)}
              </div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Per day average</div>
            </div>
          </div>
          <div
            className="grid grid-cols-4 gap-3 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            {[
              { label: "Hotels", value: trip.accommodation, icon: Tent },
              { label: "Food", value: trip.food, icon: Coffee },
              { label: "Local", value: trip.localTransport, icon: Navigation },
              { label: "Fuel", value: trip.fuel, icon: Fuel },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="text-center">
                <Icon size={13} className="mx-auto mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }} />
                <div className="text-sm font-bold text-white" style={{ fontFamily: "DM Mono, monospace" }}>
                  {formatPKR(value)}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Route */}
        {trip.routeSummary && trip.routeSummary.legs.length > 0 && (
          <div className="rounded-2xl p-5 mb-3 bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={15} style={{ color: P.fern }} />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Route · ~{trip.routeSummary.roundTripHours}h round trip
              </span>
            </div>
            <div className="space-y-1.5">
              {trip.routeSummary.legs.map((l, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>{l.from} → {l.to}</span>
                  <span className="text-xs text-muted-foreground">~{l.hours}h{l.via ? ` · ${l.via}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Conditions Banner */}
        {trip.liveConditions && trip.liveConditions.length > 0 && (
          <div
            className="rounded-2xl p-4 mb-3 flex items-start gap-3"
            style={{ background: `${P.aquamarine}20`, border: `1px solid ${P.aquamarine}` }}
          >
            <Navigation size={17} style={{ color: P.hunterGreen, flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold mb-1.5 flex items-center gap-2" style={{ color: P.blackForest, fontFamily: "Sora, sans-serif" }}>
                Live conditions
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: P.fern, color: "#fff" }}>Live</span>
              </p>
              <ul className="space-y-1">
                {trip.liveConditions.map((c, i) => (
                  <li key={i} className="text-xs leading-relaxed flex items-start gap-2" style={{ color: P.hunterGreen }}>
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: P.fern }} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Season Banner */}
        <div
          className="rounded-2xl p-4 mb-3 flex items-start gap-3"
          style={{ background: `${P.lightBlue}40`, border: `1px solid ${P.lightBlue}` }}
        >
          <Sun size={17} style={{ color: "#2a7fa5", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold mb-0.5" style={{ color: "#1a5f7a" }}>
              Best season: {trip.bestSeason}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#2a7fa5" }}>{trip.currentSeasonWarning}</p>
          </div>
        </div>

        {/* Permit Banner */}
        {trip.permitRequired && (
          <div
            className="rounded-2xl p-4 mb-8 flex items-start gap-3"
            style={{ background: `${P.amberHoney}14`, border: `1px solid ${P.amberHoney}40` }}
          >
            <AlertTriangle size={17} style={{ color: "#c47d00", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: "#7a4e00" }}>
                Permit Required — NOC for Gilgit-Baltistan
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#9a6200" }}>{trip.permitNote}</p>
            </div>
          </div>
        )}

        {/* Day Cards */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-5" style={{ fontFamily: "Sora, sans-serif" }}>
            Day-by-day plan
          </h2>

          <div className="relative">
            <div className="absolute left-5 top-5 bottom-5 w-px" style={{ background: "var(--border)" }} />

            <div className="space-y-4">
              {trip.days_data.map(day => (
                <div key={day.day} className="relative pl-14">
                  <div
                    className="absolute left-0 top-5 w-10 h-10 rounded-full flex items-center justify-center z-10"
                    style={{ background: P.fern, boxShadow: `0 4px 14px ${P.fern}40` }}
                  >
                    <span className="text-[10px] font-bold text-white" style={{ fontFamily: "DM Mono, monospace" }}>
                      D{day.day}
                    </span>
                  </div>

                  <div
                    className="bg-card rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200"
                    style={{
                      border: expandedDay === day.day ? `2px solid ${P.fern}50` : "1px solid var(--border)",
                      boxShadow: expandedDay === day.day ? `0 4px 20px ${P.fern}12` : undefined,
                    }}
                    onClick={() => setExpandedDay(expandedDay === day.day ? null : day.day)}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{day.emoji}</span>
                            <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
                              {day.destination}
                            </h3>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{day.tagline}</p>
                          <div className="flex flex-wrap gap-2">
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: `${P.lightBlue}50`, color: "#2a7fa5" }}
                            >
                              <Sun size={9} /> {day.season}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: `${P.aquamarine}25`, color: P.hunterGreen }}
                            >
                              ⭐ {day.highlight}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-base font-bold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                            {formatPKR(day.estimatedCost)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">est. cost</div>
                          <div className="mt-2 flex justify-end">
                            {expandedDay === day.day
                              ? <ChevronUp size={15} className="text-muted-foreground" />
                              : <ChevronDown size={15} className="text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {expandedDay === day.day && (
                      <div
                        className="px-5 pb-5 pt-4"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Activities</p>
                        <ul className="space-y-2">
                          {day.activities.map((act, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <div
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
                                style={{ background: P.aquamarine }}
                              />
                              <span className="text-sm text-foreground leading-relaxed">{act}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tips */}
        {trip.tips && trip.tips.length > 0 && (
          <div className="rounded-2xl p-5 mb-8 bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} style={{ color: P.amberHoney }} />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Good to know</span>
            </div>
            <ul className="space-y-1.5">
              {trip.tips.map((t, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: P.amberHoney }} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Logistics */}
        <div className="rounded-2xl p-5 mb-8 bg-card border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Navigation size={15} style={{ color: P.fern }} />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan your logistics</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Roamio suggests — you book directly. Links open external sites.</p>
          <div className="flex flex-wrap gap-2">
            {trip.destinationNames.map((name) => (
              <a key={name} target="_blank" rel="noopener noreferrer"
                 href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name + ", Pakistan")}`}
                 className="text-xs font-semibold px-3 py-2 rounded-xl border border-border bg-muted hover:border-primary/50 transition-colors flex items-center gap-1.5 text-foreground">
                <Tent size={12} /> Hotels in {name}
              </a>
            ))}
            <a target="_blank" rel="noopener noreferrer" href="https://www.daewoo.com.pk/"
               className="text-xs font-semibold px-3 py-2 rounded-xl border border-border bg-muted hover:border-primary/50 transition-colors flex items-center gap-1.5 text-foreground">
              <Navigation size={12} /> Bus · Daewoo
            </a>
            <a target="_blank" rel="noopener noreferrer" href="https://www.faisalmovers.com/"
               className="text-xs font-semibold px-3 py-2 rounded-xl border border-border bg-muted hover:border-primary/50 transition-colors flex items-center gap-1.5 text-foreground">
              <Navigation size={12} /> Bus · Faisal Movers
            </a>
            <a target="_blank" rel="noopener noreferrer"
               href={`https://www.google.com/search?q=${encodeURIComponent("4x4 jeep hire " + trip.startCity + " northern Pakistan")}`}
               className="text-xs font-semibold px-3 py-2 rounded-xl border border-border bg-muted hover:border-primary/50 transition-colors flex items-center gap-1.5 text-foreground">
              <Compass size={12} /> Car / jeep hire
            </a>
            <a target="_blank" rel="noopener noreferrer" href="https://www.google.com/travel/flights?q=flights%20to%20Skardu"
               className="text-xs font-semibold px-3 py-2 rounded-xl border border-border bg-muted hover:border-primary/50 transition-colors flex items-center gap-1.5 text-foreground">
              <Plane size={12} /> Flights north
            </a>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-3 font-semibold text-sm py-4 rounded-2xl border-2 transition-all duration-200"
            style={{
              borderColor: copied ? "#34a870" : "var(--border)",
              background: copied ? "#f0fdf6" : "var(--card)",
              color: copied ? "#166534" : "var(--foreground)",
              fontFamily: "Sora, sans-serif",
            }}
          >
            {copied ? <><Check size={17} style={{ color: "#16a34a" }} /> Link copied!</> : <><Share2 size={17} /> Copy Share Link</>}
          </button>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Edit3 size={14} style={{ color: P.fern }} />
              <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Tweak this trip</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tweakInput}
                onChange={e => setTweakInput(e.target.value)}
                placeholder="e.g. make it cheaper · add 2 days · remove Skardu"
                className="flex-1 bg-input-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:border-primary transition-all"
              />
              <button
                onClick={() => onTweak(tweakInput)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors flex-shrink-0"
                style={{ background: P.fern, fontFamily: "Sora, sans-serif" }}
              >
                Apply
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {["Make it cheaper", "+2 days", "Focus on photography", "Add a rest day"].map(s => (
                <button
                  key={s}
                  onClick={() => setTweakInput(s)}
                  className="text-[11px] text-muted-foreground bg-muted hover:bg-accent hover:text-foreground px-2.5 py-1 rounded-full transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onNewTrip}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-3 flex items-center justify-center gap-1.5"
          >
            <ArrowRight size={14} /> Plan a completely different trip
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Error Page ───────────────────────────────────────────────────────────────
function ErrorPage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 pt-16">
      <div className="max-w-md w-full text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: "#FEF2F2" }}
        >
          <AlertTriangle size={30} className="text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3" style={{ fontFamily: "Sora, sans-serif" }}>
          Couldn't plan this trip
        </h2>
        <p className="text-muted-foreground mb-2 leading-relaxed">
          Your budget might be too low for the number of days requested, or we hit an unexpected snag.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Try increasing your budget, reducing days, or adjusting your starting city.
        </p>
        <div className="space-y-3">
          <button
            onClick={onRetry}
            className="w-full font-bold py-4 rounded-2xl text-white hover:opacity-90 transition-opacity"
            style={{ background: P.fern, fontFamily: "Sora, sans-serif" }}
          >
            Adjust &amp; Try Again
          </button>
          <div className="bg-muted/70 rounded-xl p-4 text-left">
            <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide" style={{ fontFamily: "Sora, sans-serif" }}>
              Suggested fixes
            </p>
            <ul className="space-y-1.5">
              {[
                "Increase budget to at least PKR 8,000/day",
                "Reduce trip to 3–5 days for low budgets",
                "Choose Lahore or Islamabad as start city for cheaper routes",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span style={{ color: P.fern }} className="mt-0.5">→</span> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [trip, setTrip] = useState<typeof SAMPLE_TRIP>(SAMPLE_TRIP);
  const [lastForm, setLastForm] = useState<PlanForm | null>(null);
  const [status, setStatus] = useState("");
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared: stream the backend graph, update the loading status, render the result.
  const runPlan = async (form: PlanForm) => {
    setStatus("Starting…");
    setPage("loading");
    try {
      const res = await fetch(`${API_URL}/generate-itinerary/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: any = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";          // keep any incomplete trailing line
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: any;
          try { evt = JSON.parse(line); } catch { continue; }
          if (evt.type === "progress") setStatus(evt.label);
          else if (evt.type === "result") result = evt.itinerary;
          else if (evt.type === "error") throw new Error("plan error");
        }
      }
      if (!result) throw new Error("no itinerary");
      setTrip(adaptItinerary(result));
      setLastForm(form);
      setPage("itinerary");
    } catch {
      setPage("error");
    }
  };

  const handlePlanSubmit = (form: PlanForm) => {
    if (form.budget < form.days * 5000) { setPage("error"); return; }
    runPlan(form);
  };

  // "Tweak this trip": adjust the last form and re-plan (no infinite loading).
  const handleTweak = (tweak: string) => {
    if (!lastForm) { setPage("planner"); return; }
    runPlan(applyTweak(lastForm, tweak));
  };

  useEffect(() => {
    return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); };
  }, []);

  const isHeroPage = page === "landing";

  return (
    <div className="size-full" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar
        onLogoClick={() => setPage("landing")}
        onPlanClick={() => setPage("planner")}
        dark={isHeroPage}
      />
      {page === "landing"    && <LandingPage onPlanClick={() => setPage("planner")} />}
      {page === "planner"    && <PlannerPage onSubmit={handlePlanSubmit} />}
      {page === "loading"    && <LoadingPage status={status} />}
      {page === "itinerary"  && <ItineraryPage trip={trip} onTweak={handleTweak} onNewTrip={() => setPage("planner")} />}
      {page === "error"      && <ErrorPage onRetry={() => setPage("planner")} />}
    </div>
  );
}
