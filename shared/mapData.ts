// Single source of truth for map landmarks ("anchors"), shared by the server
// (which matches the free-form location string to an anchor) and the client
// (which draws the "you are here" marker on the world / Rome images).
//
// Coordinates are NORMALIZED (0..1) from the top-left of each image, so they are
// resolution-independent — the client positions the marker with CSS percentages.
//
// Anchors also carry a small curated knowledge base — what each place actually is
// (`blurb`), which paid services are plausibly available (`services`, so the model
// stops inventing an "inn on the Forum"), and a coarse `region` for travel scaling.
// This data feeds both the GM context (server/src/systemPrompt.ts) and the
// deterministic travel/economy mechanics (server/src/actions.ts).

import type { LocalTheme, MapView, ServiceKind } from "./types.js";

export interface MapAnchor {
  id: string; // stable id, e.g. "subura"
  label: string; // display name
  view: MapView; // which image this anchor lives on
  x: number; // 0..1 on that image (left → right)
  y: number; // 0..1 on that image (top → bottom)
  theme: LocalTheme; // local-map biome when the player is here
  keywords: string[]; // lowercased aliases used to match the location string
  inRome?: boolean; // true ⇒ the Rome city map can be drilled into
  blurb: string; // one line: what this place actually is (fed to the GM)
  services: ServiceKind[]; // what's plausibly purchasable here (empty ⇒ none)
  region: "rome" | "italia" | "provinces"; // coarse band for travel scaling
}

// Where the city of Rome sits on the WORLD image — used to pin the marker when
// the player is inside Rome but has zoomed the overlay out to the empire view,
// and as the world-map position of every in-Rome anchor for travel distances.
export const ROME_ON_WORLD = { x: 0.43, y: 0.45 };

export const ANCHORS: MapAnchor[] = [
  // --- Inside the city of Rome (pinned on Map_Of_Rome.png) ---
  {
    id: "forum",
    label: "The Forum Romanum",
    view: "rome",
    x: 0.48,
    y: 0.5,
    theme: "forum",
    keywords: ["forum romanum", "forum", "curia", "senate", "rostra", "comitium"],
    inRome: true,
    blurb:
      "The civic and sacred heart of Rome — law courts, the Senate's Curia, the Rostra, and triumphal monuments. Public, monumental ground: there are NO inns or lodging here.",
    services: ["food", "bribe"],
    region: "rome",
  },
  {
    id: "subura",
    label: "The Subura",
    view: "rome",
    x: 0.55,
    y: 0.42,
    theme: "slum",
    keywords: ["subura"],
    inRome: true,
    blurb:
      "Rome's most crowded, dangerous slum — towering tenement insulae, cheap taverns (popinae), brothels, and cutpurses.",
    services: ["lodging", "food", "drink", "bribe"],
    region: "rome",
  },
  {
    id: "ludus_magnus",
    label: "The Ludus Magnus",
    view: "rome",
    x: 0.63,
    y: 0.61,
    theme: "ludus",
    keywords: ["ludus magnus", "ludus", "gladiator school", "gladiatorial school"],
    inRome: true,
    blurb:
      "The great gladiatorial school beside the Colosseum — barracks, practice sands, and the lanista whose word is law over its slaves.",
    services: ["food", "bribe"],
    region: "rome",
  },
  {
    id: "colosseum",
    label: "The Colosseum",
    view: "rome",
    x: 0.63,
    y: 0.63,
    theme: "arena",
    keywords: [
      "colosseum",
      "flavian amphitheatre",
      "amphitheatre",
      "amphitheater",
      "the arena",
      "arena",
    ],
    inRome: true,
    blurb:
      "The vast amphitheatre where the mob roars for blood — tiers of stone above the hypogeum, vendors hawking to the crowd.",
    services: ["food", "drink", "bribe"],
    region: "rome",
  },
  {
    id: "circus_maximus",
    label: "The Circus Maximus",
    view: "rome",
    x: 0.45,
    y: 0.62,
    theme: "arena",
    keywords: ["circus maximus", "circus"],
    inRome: true,
    blurb:
      "Rome's huge chariot-racing track — a quarter-million scream for the racing factions while bookmakers work the stands.",
    services: ["food", "drink", "bribe"],
    region: "rome",
  },
  {
    id: "capitoline",
    label: "The Capitoline Hill",
    view: "rome",
    x: 0.42,
    y: 0.46,
    theme: "temple",
    keywords: ["capitoline", "capitol", "tabularium", "temple of jupiter"],
    inRome: true,
    blurb:
      "Rome's holiest height — the Temple of Jupiter Optimus Maximus and the record-house of the Tabularium crown the Capitoline.",
    services: ["bribe"],
    region: "rome",
  },
  {
    id: "palatine",
    label: "The Palatine Hill",
    view: "rome",
    x: 0.5,
    y: 0.56,
    theme: "villa",
    keywords: ["palatine", "palace", "domus"],
    inRome: true,
    blurb:
      "The Palatine Hill — patrician domus and palaces above the Forum, where Rome's powerful and their clients dwell.",
    services: ["bribe"],
    region: "rome",
  },
  {
    id: "aventine",
    label: "The Aventine",
    view: "rome",
    x: 0.42,
    y: 0.72,
    theme: "slum",
    keywords: ["aventine"],
    inRome: true,
    blurb:
      "A plebeian hill of warehouses, foreign cults, and dockworkers' tenements above the river.",
    services: ["lodging", "food", "drink", "bribe"],
    region: "rome",
  },
  {
    id: "campus_martius",
    label: "The Campus Martius",
    view: "rome",
    x: 0.22,
    y: 0.3,
    theme: "market",
    keywords: ["campus martius", "campus"],
    inRome: true,
    blurb:
      "Open ground by the Tiber for drills, elections, and porticoes — and the public baths the city crowds into.",
    services: ["bath", "food", "drink"],
    region: "rome",
  },
  {
    id: "tiber_docks",
    label: "The Tiber Wharves",
    view: "rome",
    x: 0.3,
    y: 0.58,
    theme: "harbor",
    keywords: ["tiber", "tiberis", "emporium", "wharf", "wharves", "river docks"],
    inRome: true,
    blurb:
      "The Tiber wharves and the Emporium — barges unload grain and marble while porters, sailors, and customs men throng the quay.",
    services: ["lodging", "food", "drink", "passage", "bribe"],
    region: "rome",
  },

  // --- Out in the empire (pinned on World_Map.png) ---
  {
    id: "ostia",
    label: "Ostia",
    view: "world",
    x: 0.41,
    y: 0.47,
    theme: "harbor",
    keywords: ["ostia", "harbor at ostia", "port of ostia", "portus"],
    blurb:
      "Rome's seaport at the Tiber mouth — warehouses of grain and the ships of the whole Mediterranean. Sea passage to the provinces begins here.",
    services: ["lodging", "food", "drink", "passage", "bribe"],
    region: "italia",
  },
  {
    id: "rhine_frontier",
    label: "The Rhine Frontier",
    view: "world",
    x: 0.31,
    y: 0.2,
    theme: "castrum",
    keywords: ["rhine", "rhenus", "castrum", "frontier fort", "germania", "limes"],
    blurb:
      "A cold legionary fort on the Rhine — earth ramparts, the grey river, and barbarian country beyond the limes.",
    services: ["food", "drink", "bribe"],
    region: "provinces",
  },
  {
    id: "danube_frontier",
    label: "The Danube Frontier",
    view: "world",
    x: 0.46,
    y: 0.28,
    theme: "castrum",
    keywords: ["danube", "danuvius", "dacia", "pannonia"],
    blurb:
      "A hard frontier camp on the Danube at the edge of Pannonia and Dacia — watchtowers and restless tribes across the water.",
    services: ["food", "drink", "bribe"],
    region: "provinces",
  },
  {
    id: "carthago",
    label: "Carthago",
    view: "world",
    x: 0.37,
    y: 0.62,
    theme: "market",
    keywords: ["carthage", "carthago", "africa proconsularis"],
    blurb:
      "Rebuilt Carthage, capital of Africa Proconsularis — a thriving port of grain, olive oil, and old ghosts.",
    services: ["lodging", "food", "drink", "passage", "bribe"],
    region: "provinces",
  },
  {
    id: "alexandria",
    label: "Alexandria",
    view: "world",
    x: 0.72,
    y: 0.74,
    theme: "market",
    keywords: ["alexandria", "aegyptus", "egypt", "nile"],
    blurb:
      "The great city of Egypt — the Pharos lighthouse, the Library, and the granary whose grain feeds Rome.",
    services: ["lodging", "food", "drink", "passage", "bath", "bribe"],
    region: "provinces",
  },
  {
    id: "antiochia",
    label: "Antiochia",
    view: "world",
    x: 0.85,
    y: 0.62,
    theme: "market",
    keywords: ["antioch", "antiochia", "syria"],
    blurb:
      "Antioch on the Orontes — wealthy Syrian metropolis, gateway to the East and its caravans.",
    services: ["lodging", "food", "drink", "passage", "bath", "bribe"],
    region: "provinces",
  },
  {
    id: "athens",
    label: "Athens",
    view: "world",
    x: 0.6,
    y: 0.55,
    theme: "temple",
    keywords: ["athens", "athenae", "greece", "achaea", "corinth"],
    blurb:
      "Ancient Athens — schools of philosophy, marble temples, and the faded glory of Greece under Rome.",
    services: ["lodging", "food", "drink", "passage", "bath", "bribe"],
    region: "provinces",
  },
  {
    id: "hispania",
    label: "Hispania",
    view: "world",
    x: 0.13,
    y: 0.52,
    theme: "wilderness",
    keywords: ["hispania", "spain", "gades", "tarraco"],
    blurb:
      "The Spanish provinces — silver mines, olive country, and tough hill tribes.",
    services: ["lodging", "food", "drink", "bribe"],
    region: "provinces",
  },
  {
    id: "gallia",
    label: "Gallia",
    view: "world",
    x: 0.22,
    y: 0.27,
    theme: "wilderness",
    keywords: ["gallia", "gaul", "lugdunum"],
    blurb:
      "Gaul — Lugdunum and the long roads north, wine and timber, recently pacified country.",
    services: ["lodging", "food", "drink", "bribe"],
    region: "provinces",
  },
  {
    id: "britannia",
    label: "Britannia",
    view: "world",
    x: 0.2,
    y: 0.12,
    theme: "wilderness",
    keywords: ["britannia", "britain", "londinium"],
    blurb:
      "The cold, misty edge of the world — Britannia, beyond the Channel, a land of tin and rebellion.",
    services: ["food", "drink", "bribe"],
    region: "provinces",
  },
  {
    id: "byzantium",
    label: "Byzantium",
    view: "world",
    x: 0.69,
    y: 0.4,
    theme: "market",
    keywords: ["byzantium", "bosphorus", "pontus euxinus"],
    blurb:
      "Byzantium on the Bosphorus — the choke-point between the Euxine Sea and the Aegean.",
    services: ["lodging", "food", "drink", "passage", "bribe"],
    region: "provinces",
  },
];

const ANCHORS_BY_ID: Record<string, MapAnchor> = Object.fromEntries(
  ANCHORS.map((a) => [a.id, a])
);

export function getAnchor(id: string | null | undefined): MapAnchor | undefined {
  return id ? ANCHORS_BY_ID[id] : undefined;
}

/**
 * Match a free-form location string to the most specific known anchor.
 * The anchor whose matched keyword is the LONGEST substring wins (so "subura"
 * beats the generic "rome"). Falls back to the Forum for any in-Rome mention,
 * else null (a generic, world-view location).
 */
export function matchAnchor(location: string): MapAnchor | null {
  const loc = location.toLowerCase();
  let best: MapAnchor | null = null;
  let bestLen = 0;
  for (const a of ANCHORS) {
    for (const kw of a.keywords) {
      if (kw.length > bestLen && loc.includes(kw)) {
        best = a;
        bestLen = kw.length;
      }
    }
  }
  if (best) return best;
  if (loc.includes("rome") || loc.includes("roma") || loc.includes("urbs")) {
    return ANCHORS_BY_ID["forum"] ?? null;
  }
  return null;
}

// ---- Travel distance model (consumed by server/src/actions.ts) ----
// Distances are derived from the anchors' positions on the WORLD image (in-Rome
// anchors collapse to ROME_ON_WORLD), so a journey scales with how far apart two
// places really are. `legs` are player turns (kept short for pacing); `perLegDays`
// is the in-game time each leg costs. Two in-Rome anchors are a walk across the
// city: one leg, no day lost.
const LEGS_PER_WORLD_UNIT = 30;
const DAYS_PER_WORLD_UNIT = 40;
const MAX_TRAVEL_LEGS = 5;

/** An anchor's position on the WORLD image (in-Rome anchors map to the city of Rome). */
export function worldPos(anchor: MapAnchor): { x: number; y: number } {
  return anchor.view === "world" ? { x: anchor.x, y: anchor.y } : { ...ROME_ON_WORLD };
}

export interface JourneyPlan {
  legs: number; // how many legs (player turns) the journey takes
  perLegDays: number; // in-game days each leg costs (0 for an intra-city walk)
}

/** Plan a journey between two anchors: how many legs, and the days each leg costs. */
export function journeyPlan(from: MapAnchor, to: MapAnchor): JourneyPlan {
  if (from.id === to.id) return { legs: 1, perLegDays: 0 };
  // A walk across the city — hours, not days.
  if (from.inRome && to.inRome) return { legs: 1, perLegDays: 0 };

  const a = worldPos(from);
  const b = worldPos(to);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const legs = Math.max(1, Math.min(MAX_TRAVEL_LEGS, Math.round(dist * LEGS_PER_WORLD_UNIT)));
  const totalDays = Math.max(1, Math.round(dist * DAYS_PER_WORLD_UNIT));
  const perLegDays = Math.max(1, Math.round(totalDays / legs));
  return { legs, perLegDays };
}
