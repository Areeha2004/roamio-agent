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
  vibes: VibeType[];
  interests: string[];
  exclude: string[];
  month: number;
  stayStyle: "budget" | "standard" | "luxury";
  transport: "car" | "local";
  focusDestination?: string;   // corpus id to anchor the trip on (from a featured pick)
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
  travel: 20000,
  budgetStatus: "comfortable",
  budgetOverBy: 0,
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
    oneWayHours: 18,
    roundTripHours: 36,
    transport: "car" as "car" | "local",
    transportOptions: {
      car: { label: "Private car", cost: 20000, one_way_hours: 18, round_trip_hours: 36 },
      local: { label: "Local / public", cost: 14000, one_way_hours: 21.6, round_trip_hours: 43.2 },
    } as Record<string, { label: string; cost: number; one_way_hours: number; round_trip_hours: number }>,
  },
  tips: ["Carry cash — ATMs are scarce up north", "Book stays ahead in peak season", "Pack warm layers even in summer"],
  sources: [
    { ref: "S1", source: "wikivoyage", title: "Hunza Valley", url: "https://en.wikivoyage.org/wiki/Hunza_Valley" },
    { ref: "S2", source: "wikipedia", title: "Hunza Valley", url: "https://en.wikipedia.org/wiki/Hunza_Valley" },
  ] as { ref: string; source: string; title: string; url: string }[],
  faithfulness: { checked: 3, verified: 3 },
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
      type: "stay" as "stay" | "travel",
      driveHours: 0,
      highlight: "Faisal Mosque at golden hour",
      notes: "Ease into the trip in the capital before the long drive north begins tomorrow.",
      sourceRefs: [] as string[],
      verified: true as boolean | null,
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
      type: "travel" as "stay" | "travel",
      driveHours: 9,
      highlight: "Saif-ul-Muluk Lake",
      notes: "A long, scenic haul up the Kaghan Valley, ending at the alpine lake at dusk.",
      sourceRefs: [] as string[],
      verified: true as boolean | null,
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
      type: "stay" as "stay" | "travel",
      driveHours: 0,
      highlight: "Attabad Lake boat ride",
      notes: "Karimabad, the capital of Hunza, offers an awe-inspiring view of Rakaposhi and the millennium-old Baltit Fort.",
      sourceRefs: ["S1", "S2"] as string[],
      verified: true as boolean | null,
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
      type: "stay" as "stay" | "travel",
      driveHours: 0,
      highlight: "Katpana Desert dunes",
      notes: "Skardu pairs turquoise lakes with the high-altitude Katpana cold desert on the Indus.",
      sourceRefs: [] as string[],
      verified: true as boolean | null,
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
      type: "travel" as "stay" | "travel",
      driveHours: 0,
      highlight: "",
      notes: "Fly back over the Karakoram if the weather holds, with a souvenir stop in Islamabad.",
      sourceRefs: [] as string[],
      verified: true as boolean | null,
    },
  ],
};

// ─── Backend wiring ───────────────────────────────────────────────────────────
// Default to the same host the page was served from (so a phone hitting the dev box
// over http://<LAN-IP>:3000 reaches the backend at <LAN-IP>:8000, not its own
// localhost). An explicit NEXT_PUBLIC_API_URL always wins.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Visual identity per grounding-source type (used by day citations + the Sources card).
const SOURCE_META: Record<string, { label: string; color: string; bg: string }> = {
  wikivoyage: { label: "Wikivoyage", color: "#2d6a4f", bg: "#2d6a4f14" },
  wikipedia: { label: "Wikipedia", color: "#33617a", bg: "#33617a14" },
  web: { label: "Web", color: "#b45309", bg: "#b4530914" },
};
const srcMeta = (s: string) => SOURCE_META[s] || { label: "Source", color: "#4a7856", bg: "#4a785614" };

// Copy text reliably — including insecure contexts (a phone on http://<LAN-IP>),
// where navigator.clipboard is undefined. Falls back to a hidden-textarea execCommand.
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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
    travel: cb.intercity_transport,
    budgetStatus: api.summary.budget?.status || "comfortable",
    budgetOverBy: api.summary.budget?.over_by_pkr || 0,
    stayStyle: cap(req.style || "standard"),
    // Season banner: when the dates are in season, show what's GOOD then (highlights);
    // only show the "avoid" note when the timing is actually off — never both.
    bestSeason: api.summary.season?.months
      ? (api.summary.feasible ? `In season — best ${api.summary.season.months}` : `Best window: ${api.summary.season.months}`)
      : (api.summary.feasible ? "In season for your dates" : "Check seasonal access"),
    currentSeasonWarning: api.summary.feasible
      ? (api.summary.season?.highlights || "")
      : (api.summary.season?.avoid || warn("season")?.text || warn("info")?.text || ""),
    liveConditions: api.warnings.filter((w: any) => w.type === "live").map((w: any) => w.text),
    permitRequired: !!permit,
    permitNote: permit?.text || "",
    shareId: api.meta?.share_id || "",
    heroImage: api.summary.hero_image || "",
    destinationNames: api.summary.destination_names || [],
    routeSummary: {
      legs: (api.route_summary?.legs || []).map((l: any) => ({ from: l.from, to: l.to, hours: l.hours, via: l.via })),
      oneWayHours: api.route_summary?.one_way_hours || Math.round((api.route_summary?.round_trip_hours || 0) / 2),
      roundTripHours: api.route_summary?.round_trip_hours || 0,
      transport: (api.route_summary?.transport || "car") as "car" | "local",
      transportOptions: (api.route_summary?.transport_options || {}) as Record<string, { label: string; cost: number; one_way_hours: number; round_trip_hours: number }>,
    },
    tips: api.tips || [],
    sources: (api.sources || []).map((s: any) => ({ ref: s.ref, source: s.source, title: s.title, url: s.url })),
    faithfulness: api.summary?.faithfulness || { checked: 0, verified: 0 },
    days_data: api.days.map((d: any) => ({
      day: d.day,
      destination: d.title,
      emoji: d.type === "travel" ? "🚗" : "🏔️",
      tagline: d.type === "travel" ? "On the road" : "Exploring",
      // Real activities only — the grounded note is shown on its own, never duplicated here.
      activities: (d.activities || []) as string[],
      estimatedCost: perDay,
      type: (d.type === "travel" ? "travel" : "stay") as "stay" | "travel",
      driveHours: d.drive_hours || 0,
      highlight: (d.activities && d.activities[0]) || "",
      notes: d.notes || "",
      sourceRefs: (d.source_refs || []) as string[],
      verified: (d.verified ?? null) as boolean | null,
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
  if (/cheaper|lower budget|less expensive|reduce budget/.test(t)) {
    // First lever for "cheaper": ride local/public instead of a private car. Only if
    // we're already on local do we trim the budget (which may swap the destination).
    if (f.transport === "car") f.transport = "local";
    else f.budget = Math.max(10000, Math.round(f.budget * 0.8));
  }
  if (/luxur|premium|higher budget|more comfort/.test(t)) { f.transport = "car"; f.budget = Math.round(f.budget * 1.3); }
  if (/local|public transport|by bus|take the bus/.test(t)) f.transport = "local";
  if (/private car|own car|rent(ed)? car|by car/.test(t)) f.transport = "car";
  if (/photograph/.test(t)) f.vibes = ["Photography"];
  if (/adventur/.test(t)) f.vibes = ["Adventure"];
  if (/chill|relax/.test(t)) f.vibes = ["Chill"];
  if (/religious|spiritual/.test(t)) f.vibes = ["Religious"];
  return f;
}

const CITIES = [
  "Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar", "Faisalabad",
  "Multan", "Quetta", "Sialkot", "Gujranwala", "Gujrat", "Hyderabad",
  "Bahawalpur", "Sargodha", "Abbottabad", "Mansehra", "Jhelum", "Muzaffarabad",
  "Mirpur", "Sukkur", "Swat", "Gilgit", "Skardu", "Rahim Yar Khan",
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

const TRANSPORT_MODES = [
  { value: "car" as const, label: "Private car", hint: "Faster, per group" },
  { value: "local" as const, label: "Local / public", hint: "Cheaper, by bus" },
];

const INTERESTS = ["Lakes", "Trekking", "Waterfalls", "Forests", "Glaciers", "Desert", "Camping", "Culture", "Heritage", "Festivals", "Off-the-beaten-path", "Wildlife"];

// Featured destinations — real corpus data & photos. Clicking one seeds the planner so
// Roamio builds a trip CENTRED on that place (vibe + interests match its tags, so the
// retrieval ranks it first), instead of dropping the user on a blank form.
type Featured = {
  id: string; name: string; region: string; season: string; days: string; highlight: string;
  image: string; vibe: VibeType; interests: string[]; idealDays: number; budget: number;
  focal?: string;   // background-position; bias sky-heavy photos lower so the scene fills the frame
};
const FEATURED: Featured[] = [
  { id: "hunza-valley", name: "Hunza Valley", region: "Gilgit-Baltistan", season: "Apr – Oct", days: "5–6 days",
    highlight: "Blossoms, ancient forts & the Karakoram",
    image: "https://adventurertreks.pk/wp-content/uploads/2024/04/Best-Months-to-Visit-Hunza-Valley.webp",
    vibe: "Photography", interests: ["Culture", "Heritage"], idealDays: 6, budget: 180000, focal: "center 62%" },
  { id: "skardu", name: "Skardu", region: "Gilgit-Baltistan", season: "Apr – Oct", days: "3–6 days",
    highlight: "Alpine lakes & high-altitude cold deserts",
    image: "https://northbackend.northonwheels.com/storage/uploads/image_6175.jpg",
    vibe: "Adventure", interests: ["Lakes", "Trekking", "Desert"], idealDays: 6, budget: 190000, focal: "center 68%" },
  { id: "fairy-meadows", name: "Fairy Meadows", region: "Gilgit-Baltistan", season: "May – Oct", days: "3–4 days",
    highlight: "Camp beneath Nanga Parbat, the Killer Mountain",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Nanga_Parbat_The_Killer_Mountain.jpg/1280px-Nanga_Parbat_The_Killer_Mountain.jpg",
    vibe: "Adventure", interests: ["Trekking", "Camping"], idealDays: 4, budget: 140000 },
  { id: "swat-valley", name: "Swat Valley", region: "Khyber Pakhtunkhwa", season: "Mar – Nov", days: "2–4 days",
    highlight: "Green valleys, alpine lakes & waterfalls",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Mahodand_l.jpg/1280px-Mahodand_l.jpg",
    vibe: "Chill", interests: ["Waterfalls", "Heritage", "Culture"], idealDays: 4, budget: 90000 },
  { id: "naran-kaghan", name: "Naran & Kaghan", region: "Khyber Pakhtunkhwa", season: "May – Oct", days: "2–4 days",
    highlight: "Saif-ul-Muluk lake & the Babusar Pass",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Siri_Paye%2C_Shogran%2C_Kaghan_Valley.jpg/1280px-Siri_Paye%2C_Shogran%2C_Kaghan_Valley.jpg",
    vibe: "Adventure", interests: ["Lakes"], idealDays: 4, budget: 100000 },
  { id: "kalash-valleys", name: "Kalash Valleys", region: "Khyber Pakhtunkhwa", season: "Apr – Oct", days: "3–5 days",
    highlight: "Ancient Kalasha culture & living festivals",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Kalash_of_Birir_Valley_%28Coniferous_Forest%29%3B_Tahsin_Shah_01.jpg/1280px-Kalash_of_Birir_Valley_%28Coniferous_Forest%29%3B_Tahsin_Shah_01.jpg",
    vibe: "Photography", interests: ["Culture", "Heritage", "Festivals"], idealDays: 5, budget: 150000 },
];

// ─── Utility ─────────────────────────────────────────────────────────────────
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const formatPKR = (n: number) => "PKR " + n.toLocaleString("en-PK");

// Turn a formal destination name into a short, common photo-search query:
// "Naran & Kaghan Valley" → "naran kaghan", "Murree & Galiyat" → "murree".
// Drops the "&", generic words (valley/galiyat/region), and any "pakistan" suffix.
// Some bare names are ambiguous on photo sites (e.g. "swat" → SWAT-team photos), so
// they get an explicit, disambiguated query instead.
const PHOTO_QUERY_OVERRIDES: Record<string, string> = {
  swat: "swat valley pakistan",
};
const photoQuery = (name: string) => {
  const q = name
    .replace(/&/g, " ")
    .replace(/\b(valley|valleys|galiyat|region|pakistan)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return PHOTO_QUERY_OVERRIDES[q] ?? q;
};

// ─── Navbar ───────────────────────────────────────────────────────────────────
// Links point to real sections that exist on the landing page (no dead About/Blog pages).
const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Destinations", id: "destinations" },
  { label: "Why Roamio", id: "why-roamio" },
];

function Navbar({
  onLogoClick,
  onPlanClick,
  onNavigate,
  dark = false,
}: {
  onLogoClick: () => void;
  onPlanClick: () => void;
  onNavigate: (id: string) => void;
  dark?: boolean;
}) {
  // Stay transparent only while sitting over the hero photo; turn solid once scrolled
  // (otherwise white nav text would vanish over the light sections below).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const transparent = dark && !scrolled;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={
        transparent
          ? { background: "transparent" }
          : { background: "rgba(239, 247, 242, 0.74)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }
      }
    >
      <div className="max-w-6xl mx-auto px-8 flex items-center justify-between" style={{ height: 72 }}>
        <button onClick={onLogoClick} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: P.aquamarine }}>
            <Compass size={15} style={{ color: P.carbonBlack }} />
          </div>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "Sora, sans-serif", color: transparent ? "#fff" : P.carbonBlack }}
          >
            Roamio
          </span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(l => (
            <button
              key={l.id}
              onClick={() => onNavigate(l.id)}
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: transparent ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <button
          onClick={onPlanClick}
          className="text-sm font-semibold px-5 py-2.5 rounded-lg active:scale-95 transition-all duration-150"
          style={{
            background: transparent ? P.aquamarine : P.fern,
            color: transparent ? P.carbonBlack : "#fff",
            fontFamily: "Sora, sans-serif",
          }}
        >
          Plan a Trip
        </button>
      </div>
    </nav>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onPlanClick, onPickDestination }: { onPlanClick: () => void; onPickDestination: (d: Featured) => void }) {
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
          {/* Upper text block (no bottom spacer on mobile — the search bar is desktop-only) */}
          <div className="flex items-center flex-1 pb-0 md:pb-36">
            <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full pt-24 md:pt-20">
              <div
                className="inline-flex items-center gap-2 border rounded-full px-3.5 py-1.5 mb-5 sm:mb-7"
                style={{ borderColor: `${P.aquamarine}40`, background: `${P.aquamarine}14` }}
              >
                <Leaf size={12} style={{ color: P.aquamarine }} />
                <span
                  className="text-[10px] sm:text-xs font-semibold tracking-[0.16em] uppercase"
                  style={{ color: P.aquamarine }}
                >
                  AI-Powered Pakistan Travel
                </span>
              </div>

              <h1
                className="text-[2.75rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight mb-4 sm:mb-5 max-w-2xl"
                style={{ fontFamily: "Sora, sans-serif" }}
              >
                Wander Pakistan.<br />
                <span style={{ color: P.aquamarine }}>Beyond</span> Boundaries.
              </h1>

              <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-md mb-7 sm:mb-8">
                Tell Roamio your days, budget and vibe — get a full day-by-day Pakistan trip plan in seconds.
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-md sm:max-w-none">
                <button
                  onClick={onPlanClick}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 font-bold text-sm px-7 py-4 sm:py-3.5 rounded-xl active:scale-95 transition-all duration-150"
                  style={{
                    background: P.aquamarine,
                    color: P.carbonBlack,
                    fontFamily: "Sora, sans-serif",
                    boxShadow: `0 8px 28px ${P.aquamarine}35`,
                  }}
                >
                  Plan My Trip <ArrowRight size={16} />
                </button>

                {/* Trust line — authentic facts, shown on mobile too */}
                <div
                  className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  <Check size={14} style={{ color: P.aquamarine, flexShrink: 0 }} />
                  <span className="text-xs text-white/75">
                    <span className="text-white font-semibold">15+ destinations</span> · real routes &amp; permits
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom quick-search bar (desktop only; on mobile the hero uses the
              full-width "Plan My Trip" button instead, to keep it light and uncluttered) ── */}
          <div className="hidden md:block absolute bottom-0 left-0 right-0 px-8 pb-0">
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
      <section id="how-it-works" className="py-24 px-6 bg-background">
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
                title: "Roamio builds a grounded plan",
                desc: "It picks destinations from a curated corpus, builds a real route, costs it, and checks season & permits — then writes it up day by day.",
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
      <section id="destinations" className="py-24 px-6" style={{ background: `${P.aquamarine}10` }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span
                className="text-xs font-bold tracking-[0.18em] uppercase mb-3 block"
                style={{ color: P.fern }}
              >
                Featured destinations
              </span>
              <h2
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: "Sora, sans-serif" }}
              >
                Start with a place that calls you
              </h2>
              <p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
                Pick one and Roamio builds a full trip around it — route, costs, season and permits. You can still tweak everything after.
              </p>
            </div>
            <button
              onClick={onPlanClick}
              className="flex-shrink-0 text-sm font-semibold flex items-center gap-1.5 transition-colors"
              style={{ color: P.fern }}
            >
              Start from scratch <ArrowRight size={15} />
            </button>
          </div>

          {/* 2-up so cards stay WIDE on desktop — a wide frame makes object/bg-cover crop the
              empty sky off the top of each photo (a narrow 3-up card barely crops, so the
              pale sky showed). */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURED.map((d) => (
              <button
                key={d.name}
                onClick={() => onPickDestination(d)}
                className="group text-left bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="relative h-60 overflow-hidden bg-muted">
                  {/* CSS background-image always covers the frame edge-to-edge. focal lets
                      sky-heavy photos sit lower so the scene fills the frame, not the sky. */}
                  <div
                    role="img"
                    aria-label={d.name}
                    className="absolute inset-0 bg-cover bg-no-repeat group-hover:scale-105 transition-transform duration-500"
                    style={{ backgroundImage: `url("${d.image}")`, backgroundPosition: d.focal ?? "center" }}
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,31,22,0.78) 0%, rgba(26,31,22,0.1) 55%, transparent 80%)" }} />
                  {/* Region chip + name overlaid on the photo for a more immersive card */}
                  <span
                    className="absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                    style={{ background: "rgba(255,255,255,0.92)", color: P.carbonBlack }}
                  >
                    {d.region}
                  </span>
                  <h3
                    className="absolute bottom-3 left-4 right-4 text-lg font-bold text-white"
                    style={{ fontFamily: "Sora, sans-serif" }}
                  >
                    {d.name}
                  </h3>
                </div>
                <div className="p-5">
                  <p className="text-sm text-foreground mb-3 leading-snug">{d.highlight}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Sun size={12} style={{ color: P.amberHoney }} /> {d.season}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} style={{ color: P.fern }} /> {d.days}
                      </span>
                    </div>
                    <span
                      className="text-xs font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: P.fern }}
                    >
                      Plan this <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Roamio ── */}
      <section id="why-roamio" className="py-24 px-6 bg-background">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-bold tracking-[0.18em] uppercase mb-3 block" style={{ color: P.fern }}>
              Why Roamio
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
              Grounded in real data,<br className="hidden md:block" /> not guessed by a chatbot
            </h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
              Every route, cost and permit comes from a curated corpus of Northern Pakistan. The AI only writes the words — the numbers and decisions are real.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Check, title: "Grounded picks", desc: "Destinations matched to your vibe from a hand-checked corpus — no made-up places." },
              { icon: Navigation, title: "Real routes & costs", desc: "Drive times, transport, hotels and food computed from real ranges, with a clear breakdown." },
              { icon: Sun, title: "Season & live checks", desc: "Seasonal access and permit notes built in, plus live road & weather conditions on top." },
              { icon: Share2, title: "Tweak & share", desc: "Make it cheaper, add days or change the vibe instantly — then share a link to your plan." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${P.aquamarine}25` }}>
                  <Icon size={18} style={{ color: P.hunterGreen }} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-2" style={{ fontFamily: "Sora, sans-serif" }}>{title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
              </div>
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
          <p className="text-xs text-muted-foreground text-center md:text-right">
            AI-powered Pakistan trip planning · costs & times are estimates — verify prices and road conditions before booking.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Planner Page ─────────────────────────────────────────────────────────────
type PlannerSeed = { days?: number; budget?: number; vibes?: VibeType[]; interests?: string[]; focusDestination?: string; featuredName?: string };
function PlannerPage({ onSubmit, seed }: { onSubmit: (form: PlanForm) => void; seed?: PlannerSeed }) {
  const [form, setForm] = useState<PlanForm>({
    days: seed?.days ?? 5,
    budget: seed?.budget ?? 75000,
    startCity: "Islamabad",
    groupType: null,
    vibes: seed?.vibes ?? [],
    interests: seed?.interests ?? [],
    exclude: [],
    month: 7,
    stayStyle: "standard",
    transport: "car",
    focusDestination: seed?.focusDestination,
  });
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    const errs: string[] = [];
    if (!form.groupType) errs.push("Please select a group type.");
    if (!form.vibes.length) errs.push("Please select at least one trip vibe.");
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

        {seed?.featuredName && (
          <div className="mb-8 rounded-2xl p-4 flex items-start gap-3" style={{ background: `${P.aquamarine}1f`, border: `1px solid ${P.aquamarine}` }}>
            <MapPin size={16} style={{ color: P.hunterGreen, flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm leading-relaxed" style={{ color: P.hunterGreen }}>
              Building your trip around <span className="font-bold">{seed.featuredName}</span>. We’ve set a sensible length and vibe — adjust anything below, then generate.
            </p>
          </div>
        )}

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

          {/* Transport (optional) */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              How will you get around? <span className="text-xs font-normal text-muted-foreground">· optional</span>
            </label>
            <p className="text-xs text-muted-foreground mb-4">Both are costed either way. If your trip runs over budget, Roamio will try local transport before trimming the plan.</p>
            <div className="grid grid-cols-2 gap-3">
              {TRANSPORT_MODES.map(({ value, label, hint }) => (
                <button
                  key={value}
                  onClick={() => setForm(f => ({ ...f, transport: value }))}
                  className="flex flex-col items-start gap-1 px-3 py-3 rounded-xl border-2 text-left transition-all duration-150"
                  style={{
                    borderColor: form.transport === value ? P.fern : "var(--border)",
                    background: form.transport === value ? `${P.fern}12` : "var(--muted)",
                  }}
                >
                  <span className="text-sm font-semibold" style={{ color: form.transport === value ? P.hunterGreen : "var(--foreground)", fontFamily: "Sora, sans-serif" }}>{label}</span>
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

          {/* Vibe (multi-select) */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Trip vibe(s)
            </label>
            <p className="text-xs text-muted-foreground mb-4">Pick one or more — combining vibes gives more varied results.</p>
            <div className="grid grid-cols-2 gap-3">
              {VIBES.map(({ label, icon: Icon, desc }) => {
                const active = form.vibes.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => setForm(f => ({ ...f, vibes: active ? f.vibes.filter(v => v !== label) : [...f.vibes, label] }))}
                    className="flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl border-2 text-left transition-all duration-150"
                    style={{
                      borderColor: active ? P.fern : "var(--border)",
                      background: active ? `${P.fern}12` : "var(--muted)",
                    }}
                  >
                    <Icon size={18} style={{ color: active ? P.fern : "var(--muted-foreground)" }} />
                    <span className="text-sm font-semibold" style={{ color: active ? P.hunterGreen : "var(--foreground)", fontFamily: "Sora, sans-serif" }}>
                      {label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interests (multi-select) */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Sora, sans-serif" }}>
              Interests <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-4">What are you into? This steers the destination search.</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((label) => {
                const active = form.interests.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => setForm(f => ({ ...f, interests: active ? f.interests.filter(i => i !== label) : [...f.interests, label] }))}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all duration-150"
                    style={{
                      borderColor: active ? P.fern : "var(--border)",
                      background: active ? `${P.fern}12` : "var(--muted)",
                      color: active ? P.hunterGreen : "var(--foreground)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
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
export function ItineraryPage({ trip, onTweak, onShare, onNewTrip }: { trip: typeof SAMPLE_TRIP; onTweak: (tweak: string) => void; onShare?: () => Promise<string | null>; onNewTrip: () => void }) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tweakInput, setTweakInput] = useState("");
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  // `trip` arrives as a prop — live API data, or SAMPLE_TRIP before a search runs.
  // Look up a day's cited source refs (e.g. "S1") back to the full source record.
  const sourceByRef = Object.fromEntries((trip.sources || []).map(s => [s.ref, s])) as Record<string, { ref: string; source: string; title: string; url: string }>;
  const groundedCount = new Set((trip.sources || []).map(s => s.url || s.title)).size;

  // Save-on-share: the trip is only written to the DB the first time the user copies
  // its link (via onShare). Subsequent clicks reuse the id already on `trip`.
  const handleCopy = async () => {
    let id = trip.shareId;
    if (!id && onShare) {
      setSharing(true);
      try { id = (await onShare()) || ""; } catch { id = ""; }
      setSharing(false);
    }
    const url = id ? `${window.location.origin}/trip/${id}` : window.location.href;

    // On mobile, offer the native share sheet first (when the browser allows it).
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title: trip.title, url });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return; // user dismissed the sheet
        // otherwise fall through to clipboard
      }
    }

    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      window.prompt("Copy your trip link:", url); // last resort if copy is blocked
    }
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Hero */}
        {trip.heroImage ? (
          <div className="relative rounded-2xl overflow-hidden mb-6 h-60 md:h-80 bg-muted">
            <img
              src={trip.heroImage}
              alt={trip.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,31,22,0.9) 0%, rgba(26,31,22,0.25) 45%, transparent 72%)" }} />
            {/* Quick-glance glass chips overlaid on the hero */}
            <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2">
              {[
                { icon: Calendar, text: `${trip.days} days` },
                { icon: MapPin, text: `From ${trip.startCity}` },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 text-white"
                      style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <Icon size={11} /> {text}
                </span>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-7">
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>Your Itinerary</span>
              <h1 className="text-2xl md:text-4xl font-bold text-white mt-1 mb-2.5" style={{ fontFamily: "Sora, sans-serif" }}>
                {trip.title}
              </h1>
              {trip.destinationNames[0] && (
                <a
                  href={`https://unsplash.com/s/photos/${encodeURIComponent(photoQuery(trip.destinationNames[0]))}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: "rgba(255,255,255,0.92)" }}
                >
                  <Camera size={13} /> Explore {trip.destinationNames[0]} photos →
                </a>
              )}
            </div>
          </div>
        ) : null}

        {/* Header (title lives on the hero when there's an image) */}
        <div className="mb-8">
          {!trip.heroImage && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: P.fern }}>Your Itinerary</span>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-xs text-muted-foreground">Generated just now</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2" style={{ fontFamily: "Sora, sans-serif" }}>
                {trip.title}
              </h1>
            </>
          )}
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
            {groundedCount > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold" style={{ background: `${P.fern}14`, color: P.fern }}>
                <Check size={12} /> Grounded in {groundedCount} {groundedCount === 1 ? "source" : "sources"}
              </span>
            )}
          </div>
        </div>

        {/* Photo galleries */}
        {trip.destinationNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Camera size={12} /> Galleries:</span>
            {trip.destinationNames.map((name) => (
              <a key={"g-" + name} target="_blank" rel="noopener noreferrer"
                 href={`https://unsplash.com/s/photos/${encodeURIComponent(photoQuery(name))}`}
                 className="text-xs font-semibold px-2.5 py-1 rounded-full border border-border hover:border-primary/50 transition-colors text-foreground">
                {name}
              </a>
            ))}
          </div>
        )}

        {/* Cost Summary */}
        <div
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: P.blackForest }}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Wallet size={15} style={{ color: P.aquamarine }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: `${P.aquamarine}90` }}>
                Cost Breakdown
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
              {trip.stayStyle} stay
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                {formatPKR(trip.totalCost)}
              </div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Total estimate</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold mb-0.5" style={{ fontFamily: "DM Mono, monospace", color: P.aquamarine }}>
                {formatPKR(trip.perDayCost)}
              </div>
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Per day average</div>
            </div>
          </div>
          {/* 2x2 on mobile, 4-up on larger screens — keeps the PKR figures from cramping */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            {[
              { label: "Hotels", value: trip.accommodation, icon: Tent },
              { label: "Food", value: trip.food, icon: Coffee },
              { label: "Local", value: trip.localTransport, icon: Navigation },
              { label: "Transport", value: trip.travel, icon: Fuel },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Icon size={13} className="mb-1.5" style={{ color: `${P.aquamarine}99` }} />
                <div className="text-sm font-bold text-white" style={{ fontFamily: "DM Mono, monospace" }}>
                  {formatPKR(value)}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Slightly-over-budget notice — we kept the on-theme picks instead of swapping */}
        {trip.budgetStatus === "slightly_over" && (
          <div className="rounded-2xl p-4 mb-3 flex items-start gap-3" style={{ background: "#fff7ed", border: "1px solid #fdba74" }}>
            <Wallet size={17} style={{ color: "#c2620c", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: "#9a3412" }}>
                ≈ {formatPKR(trip.budgetOverBy)} over budget — but it matches your taste
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#b45309" }}>
                We kept the destinations you chose. Tap “Make it cheaper” to trim to a cheaper, still-relevant plan, or nudge your budget up.
              </p>
            </div>
          </div>
        )}

        {/* Route */}
        {trip.routeSummary && trip.routeSummary.legs.length > 0 && (
          <div className="rounded-2xl p-5 mb-3 bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={15} style={{ color: P.fern }} />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Route · ~{trip.routeSummary.oneWayHours}h one way
              </span>
            </div>
            <div>
              {trip.routeSummary.legs.map((l, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: P.fern }} />
                    {i < trip.routeSummary.legs.length - 1 && (
                      <div className="w-px flex-1 my-1" style={{ background: `${P.fern}40` }} />
                    )}
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
                      {l.from} <span style={{ color: P.fern }}>→</span> {l.to}
                    </div>
                    <div className="text-xs text-muted-foreground">~{l.hours}h{l.via ? ` · ${l.via}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Transport comparison — car vs local, upfront, so you can choose before tweaking */}
            {trip.routeSummary.transportOptions && Object.keys(trip.routeSummary.transportOptions).length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                {(["car", "local"] as const).map((mode) => {
                  const o = trip.routeSummary.transportOptions[mode];
                  if (!o) return null;
                  const active = trip.routeSummary.transport === mode;
                  return (
                    <div
                      key={mode}
                      className="rounded-xl px-3 py-2.5"
                      style={{
                        background: active ? `${P.fern}18` : "transparent",
                        border: `1px solid ${active ? P.fern : "rgba(0,0,0,0.08)"}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{o.label}</span>
                        {active && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: P.fern, color: "#fff" }}>Chosen</span>}
                      </div>
                      <div className="text-sm font-bold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{formatPKR(o.cost)}</div>
                      <div className="text-[11px] text-muted-foreground">~{o.one_way_hours}h one way</div>
                    </div>
                  );
                })}
              </div>
            )}
            {trip.routeSummary.transport === "car" && trip.routeSummary.transportOptions?.local && (
              <p className="text-[11px] text-muted-foreground mt-2.5">
                Tip: tap “Make it cheaper” to switch to local/public transport.
              </p>
            )}
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
              {trip.bestSeason}
            </p>
            {trip.currentSeasonWarning && (
              <p className="text-xs leading-relaxed" style={{ color: "#2a7fa5" }}>{trip.currentSeasonWarning}</p>
            )}
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
                Permits &amp; entry
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
                          <div className="flex flex-wrap items-center gap-2">
                            {day.type === "travel" && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                                style={{ background: `${P.lightBlue}50`, color: "#2a7fa5" }}
                              >
                                <Navigation size={9} /> {day.driveHours > 0 ? `~${day.driveHours}h drive` : "Travel day"}
                              </span>
                            )}
                            {day.highlight && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full max-w-[220px]"
                                style={{ background: `${P.aquamarine}25`, color: P.hunterGreen }}
                              >
                                <span className="flex-shrink-0">⭐</span>
                                <span className="truncate">{day.highlight}</span>
                              </span>
                            )}
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
                        {day.verified === true && (
                          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-3 px-2 py-1 rounded-full" style={{ background: `${P.fern}14`, color: P.fern }}>
                            <Check size={10} /> Fact-checked
                          </div>
                        )}
                        {day.notes && (
                          <p className="text-sm leading-relaxed mb-4 pl-3" style={{ color: "var(--muted-foreground)", borderLeft: `2px solid ${P.fern}33` }}>
                            {day.notes}
                          </p>
                        )}
                        {day.activities.length > 0 && (
                          <>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Things to do</p>
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
                          </>
                        )}

                        {/* Per-day grounding — which real sources this day was written from */}
                        {day.sourceRefs && day.sourceRefs.length > 0 && (
                          <div className="mt-4 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                              <Check size={11} style={{ color: P.fern }} /> Grounded in
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {day.sourceRefs.map(ref => {
                                const s = sourceByRef[ref];
                                if (!s) return null;
                                const m = srcMeta(s.source);
                                return (
                                  <a key={ref} href={s.url || undefined} target="_blank" rel="noopener noreferrer"
                                     className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                     style={{ background: m.bg, color: m.color }}>
                                    <span className="font-bold">{m.label}</span>
                                    <span className="opacity-75 max-w-[140px] truncate">{s.title}</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
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

        {/* Sources — the real travel content the day notes were grounded in (RAG citations) */}
        {trip.sources && trip.sources.length > 0 && (
          <div className="rounded-2xl mb-8 overflow-hidden border border-border bg-card">
            {/* Header band — frames the grounding as a trust feature */}
            <div className="p-5 pb-4" style={{ background: `linear-gradient(135deg, ${P.fern}0f, transparent)` }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${P.fern}1a` }}>
                    <Check size={16} style={{ color: P.fern }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Grounded in real sources</p>
                    <p className="text-[11px] text-muted-foreground">Day notes are written from these real travel sources — retrieved, not invented.</p>
                    {trip.faithfulness && trip.faithfulness.checked > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold mt-2 px-2 py-0.5 rounded-full" style={{ background: `${P.fern}14`, color: P.fern }}>
                        <Check size={11} /> {trip.faithfulness.checked} {trip.faithfulness.checked === 1 ? "day" : "days"} fact-checked against sources
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: `${P.fern}1a`, color: P.fern }}>
                  {groundedCount} {groundedCount === 1 ? "source" : "sources"}
                </span>
              </div>
            </div>
            {/* Source cards */}
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Array.from(new Map(trip.sources.map(s => [s.url || s.title, s])).values()).map((s) => {
                const m = srcMeta(s.source);
                return (
                  <a key={s.url || s.title} target="_blank" rel="noopener noreferrer" href={s.url || undefined}
                     className="group rounded-xl border border-border p-3 flex items-center gap-3 hover:shadow-md transition-all bg-background">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-md flex-shrink-0" style={{ background: m.bg, color: m.color }}>
                      {m.label}
                    </span>
                    <span className="text-sm font-medium text-foreground flex-1 truncate">{s.title}</span>
                    <ArrowRight size={14} className="flex-shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" style={{ color: m.color }} />
                  </a>
                );
              })}
            </div>
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
            disabled={sharing}
            className="w-full flex items-center justify-center gap-3 font-semibold text-sm py-4 rounded-2xl border-2 transition-all duration-200 disabled:opacity-70"
            style={{
              borderColor: copied ? "#34a870" : "var(--border)",
              background: copied ? "#f0fdf6" : "var(--card)",
              color: copied ? "#166534" : "var(--foreground)",
              fontFamily: "Sora, sans-serif",
            }}
          >
            {sharing
              ? <><Share2 size={17} /> Creating link…</>
              : copied
                ? <><Check size={17} style={{ color: "#16a34a" }} /> Link copied!</>
                : <><Share2 size={17} /> Copy Share Link</>}
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
              {["Somewhere else", "Make it cheaper", "+2 days", "Add a rest day"].map(s => (
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
  const [rawTrip, setRawTrip] = useState<any>(null);   // backend itinerary JSON, saved only on share
  const [seed, setSeed] = useState<PlannerSeed | undefined>(undefined);  // featured-destination prefill
  const [lastForm, setLastForm] = useState<PlanForm | null>(null);
  const [status, setStatus] = useState("");
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared: stream the backend graph, update the loading status, render the result.
  const runPlan = async (form: PlanForm) => {
    setStatus("Starting…");
    setPage("loading");
    const payload = {
      days: form.days, budget: form.budget, startCity: form.startCity,
      groupType: form.groupType, month: form.month, stayStyle: form.stayStyle,
      transport: form.transport,
      focus: form.focusDestination || "",
      vibe: form.vibes[0] || "Adventure",
      interests: [...form.vibes.slice(1).map(v => v.toLowerCase()), ...form.interests.map(i => i.toLowerCase())],
      exclude: form.exclude,
    };
    try {
      const res = await fetch(`${API_URL}/generate-itinerary/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setRawTrip(result);          // kept in memory; persisted to the DB only if the user shares
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
    let form = applyTweak(lastForm, tweak);
    const t = tweak.toLowerCase();
    // Any "change the place" tweak must release the anchored focus, or search would
    // force the same destination straight back in.
    if (/other place|somewhere else|different (place|destination|spot)|change (the )?(destination|place)|elsewhere|new place|remove|without|skip|exclude/.test(t)) {
      form = { ...form, focusDestination: undefined };
    }
    // "somewhere else" / "different place" → exclude the current destinations
    if (/other place|somewhere else|different (place|destination|spot)|change (the )?(destination|place)|elsewhere|new place/.test(t)) {
      form = { ...form, exclude: [...form.exclude, ...trip.destinationNames] };
    }
    // "remove X" / "without X" → exclude a named place
    const rm = t.match(/(?:remove|without|skip|exclude)\s+([a-z][a-z &]+)/);
    if (rm && rm[1]) form = { ...form, exclude: [...form.exclude, rm[1].trim()] };
    // exclude any currently-shown destination the user names (e.g. "no naran kaghan")
    trip.destinationNames.forEach((name) => {
      const first = name.split(/[\s&]+/)[0].toLowerCase();
      if (t.includes(name.toLowerCase()) || (first.length > 3 && t.includes(first))) {
        form = { ...form, exclude: [...form.exclude, name], focusDestination: undefined };
      }
    });
    runPlan(form);
  };

  // Persist the trip on demand (only when the user shares / copies the link) and
  // return its share id. The id is cached on `trip` so a second click won't re-save.
  const handleShare = async (): Promise<string | null> => {
    if (trip.shareId) return trip.shareId;
    if (!rawTrip) return null;
    try {
      const res = await fetch(`${API_URL}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawTrip),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const id: string | null = data.share_id || null;
      if (id) setTrip(t => ({ ...t, shareId: id }));
      return id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); };
  }, []);

  // A featured-destination click seeds the planner so the trip is built around that place.
  const handlePickDestination = (d: Featured) => {
    setSeed({ days: d.idealDays, budget: d.budget, vibes: [d.vibe], interests: d.interests,
              focusDestination: d.id, featuredName: d.name });
    setPage("planner");
  };

  // Navbar links jump to real sections on the landing page. If we're on another page,
  // switch to landing first, then scroll once it has rendered.
  const goToSection = (id: string) => {
    const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (page === "landing") { scroll(); return; }
    setPage("landing");
    setTimeout(scroll, 80);
  };

  const isHeroPage = page === "landing";

  return (
    <div className="size-full" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar
        onLogoClick={() => setPage("landing")}
        onPlanClick={() => { setSeed(undefined); setPage("planner"); }}
        onNavigate={goToSection}
        dark={isHeroPage}
      />
      {page === "landing"    && <LandingPage onPlanClick={() => { setSeed(undefined); setPage("planner"); }} onPickDestination={handlePickDestination} />}
      {page === "planner"    && <PlannerPage onSubmit={handlePlanSubmit} seed={seed} />}
      {page === "loading"    && <LoadingPage status={status} />}
      {page === "itinerary"  && <ItineraryPage trip={trip} onTweak={handleTweak} onShare={handleShare} onNewTrip={() => setPage("planner")} />}
      {page === "error"      && <ErrorPage onRetry={() => setPage("planner")} />}
    </div>
  );
}
