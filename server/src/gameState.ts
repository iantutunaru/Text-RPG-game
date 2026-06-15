// Game-state factory, archetype presets, and numeric clamp helpers.

import { nanoid } from "nanoid";
import type {
  Archetype,
  Attributes,
  Character,
  GameState,
  Item,
  World,
} from "../../shared/types.js";

export const ARCHETYPES: Archetype[] = [
  "gladiator",
  "senator",
  "legionary",
  "merchant",
  "freedman",
];

interface ArchetypePreset {
  attributes: Attributes;
  maxHp: number;
  gold: number;
  reputation: number;
  inventory: Item[];
  location: string;
  /** Opening situation handed to the GM to generate the first scene. */
  hook: string;
}

const PRESETS: Record<Archetype, ArchetypePreset> = {
  gladiator: {
    attributes: { might: 8, agility: 6, wits: 4, charm: 4 },
    maxHp: 32,
    gold: 15,
    reputation: 5,
    inventory: [
      { name: "Gladius", description: "A short, well-balanced iron sword.", qty: 1 },
      { name: "Worn tunic", description: "Coarse, sweat-stained cloth.", qty: 1 },
    ],
    location: "the Ludus Magnus (gladiator school), Rome",
    hook: "You are a slave sworn to the arena, training in the great gladiator school beside the Colosseum. Dawn breaks over the sands; the lanista's whip and the promise of freedom both wait. Your first match approaches.",
  },
  senator: {
    attributes: { might: 3, agility: 4, wits: 8, charm: 8 },
    maxHp: 18,
    gold: 500,
    reputation: 30,
    inventory: [
      { name: "Senatorial toga", description: "White wool bordered with the broad purple stripe.", qty: 1 },
      { name: "Signet ring", description: "Seals your authority in wax.", qty: 1 },
      { name: "Wax tablet", description: "For notes, debts, and quiet bargains.", qty: 1 },
    ],
    location: "the Forum Romanum, Rome",
    hook: "You are a senator of Rome in restless times. The Curia hums with rumor of plots between Optimates and Populares; a discreet message reached you at dawn, hinting that your name is spoken in a dangerous conspiracy.",
  },
  legionary: {
    attributes: { might: 7, agility: 6, wits: 5, charm: 4 },
    maxHp: 28,
    gold: 50,
    reputation: 10,
    inventory: [
      { name: "Gladius", description: "Standard-issue legionary blade.", qty: 1 },
      { name: "Scutum", description: "A large curved shield, the wall of Rome.", qty: 1 },
      { name: "Lorica segmentata", description: "Banded iron armor.", qty: 1 },
    ],
    location: "a frontier castrum on the Rhine",
    hook: "You are a legionary of Rome posted to a cold fort on the Rhine frontier. Scouts have not returned, the Germanic tribes are stirring beyond the river, and your centurion is calling the contubernium to muster in the grey dawn.",
  },
  merchant: {
    attributes: { might: 4, agility: 5, wits: 7, charm: 7 },
    maxHp: 20,
    gold: 300,
    reputation: 10,
    inventory: [
      { name: "Ledger", description: "Your accounts, debts owed and owing.", qty: 1 },
      { name: "Coin purse", description: "Heavy with mixed coin.", qty: 1 },
      { name: "Mule", description: "Stubborn but strong; carries your goods.", qty: 1 },
    ],
    location: "the harbor at Ostia",
    hook: "You are a mercator newly arrived at the teeming port of Ostia, a ship of Egyptian grain and Syrian glass riding at anchor. Fortunes are made and lost here in a morning — and a harbor official is eyeing your cargo with too much interest.",
  },
  freedman: {
    attributes: { might: 5, agility: 6, wits: 6, charm: 5 },
    maxHp: 22,
    gold: 10,
    reputation: -10,
    inventory: [
      { name: "Rough tunic", description: "Plain, but your own.", qty: 1 },
      { name: "Pileus", description: "The felt cap of a freed slave — proof you are no longer property.", qty: 1 },
    ],
    location: "the Subura, Rome's crowded slums",
    hook: "You are newly freed — a libertus with the felt cap and little else — in the noisy, dangerous Subura. Your former master's patronage is thin, your debts are real, and someone from your enslaved past has just recognized your face in the crowd.",
  },
};

export function getHook(archetype: Archetype): string {
  return PRESETS[archetype].hook;
}

export function createGame(name: string, archetype: Archetype): GameState {
  const preset = PRESETS[archetype];
  const now = new Date().toISOString();
  const character: Character = {
    name,
    archetype,
    attributes: { ...preset.attributes },
    hp: preset.maxHp,
    maxHp: preset.maxHp,
    gold: preset.gold,
    reputation: preset.reputation,
    level: 1,
    xp: 0,
  };
  const world: World = {
    location: preset.location,
    day: 1,
    timeOfDay: "dawn",
    flags: {},
  };
  return {
    id: nanoid(12),
    createdAt: now,
    updatedAt: now,
    status: "active",
    character,
    inventory: preset.inventory.map((i) => ({ ...i })),
    world,
    transcript: [],
    storySoFar: "",
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Coerce a possibly-string/undefined value from the model into a number. */
export function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
