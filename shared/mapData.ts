// Single source of truth for map landmarks ("anchors"), shared by the server
// (which matches the free-form location string to an anchor) and the client
// (which draws the "you are here" marker on the world / Rome images).
//
// Coordinates are NORMALIZED (0..1) from the top-left of each image, so they are
// resolution-independent — the client positions the marker with CSS percentages.

import type { LocalTheme, MapView } from "./types.js";

export interface MapAnchor {
  id: string; // stable id, e.g. "subura"
  label: string; // display name
  view: MapView; // which image this anchor lives on
  x: number; // 0..1 on that image (left → right)
  y: number; // 0..1 on that image (top → bottom)
  theme: LocalTheme; // local-map biome when the player is here
  keywords: string[]; // lowercased aliases used to match the location string
  inRome?: boolean; // true ⇒ the Rome city map can be drilled into
}

// Where the city of Rome sits on the WORLD image — used to pin the marker when
// the player is inside Rome but has zoomed the overlay out to the empire view.
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
  },
  {
    id: "rhine_frontier",
    label: "The Rhine Frontier",
    view: "world",
    x: 0.31,
    y: 0.2,
    theme: "castrum",
    keywords: ["rhine", "rhenus", "castrum", "frontier fort", "germania", "limes"],
  },
  {
    id: "danube_frontier",
    label: "The Danube Frontier",
    view: "world",
    x: 0.46,
    y: 0.28,
    theme: "castrum",
    keywords: ["danube", "danuvius", "dacia", "pannonia"],
  },
  {
    id: "carthago",
    label: "Carthago",
    view: "world",
    x: 0.37,
    y: 0.62,
    theme: "market",
    keywords: ["carthage", "carthago", "africa proconsularis"],
  },
  {
    id: "alexandria",
    label: "Alexandria",
    view: "world",
    x: 0.72,
    y: 0.74,
    theme: "market",
    keywords: ["alexandria", "aegyptus", "egypt", "nile"],
  },
  {
    id: "antiochia",
    label: "Antiochia",
    view: "world",
    x: 0.85,
    y: 0.62,
    theme: "market",
    keywords: ["antioch", "antiochia", "syria"],
  },
  {
    id: "athens",
    label: "Athens",
    view: "world",
    x: 0.6,
    y: 0.55,
    theme: "temple",
    keywords: ["athens", "athenae", "greece", "achaea", "corinth"],
  },
  {
    id: "hispania",
    label: "Hispania",
    view: "world",
    x: 0.13,
    y: 0.52,
    theme: "wilderness",
    keywords: ["hispania", "spain", "gades", "tarraco"],
  },
  {
    id: "gallia",
    label: "Gallia",
    view: "world",
    x: 0.22,
    y: 0.27,
    theme: "wilderness",
    keywords: ["gallia", "gaul", "lugdunum"],
  },
  {
    id: "britannia",
    label: "Britannia",
    view: "world",
    x: 0.2,
    y: 0.12,
    theme: "wilderness",
    keywords: ["britannia", "britain", "londinium"],
  },
  {
    id: "byzantium",
    label: "Byzantium",
    view: "world",
    x: 0.69,
    y: 0.4,
    theme: "market",
    keywords: ["byzantium", "bosphorus", "pontus euxinus"],
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
