// Game-state factory, archetype presets, and numeric clamp helpers.

import { nanoid } from "nanoid";
import type {
  Ability,
  Archetype,
  Attributes,
  Character,
  GameState,
  Item,
  PlayerStatus,
  World,
} from "../../shared/types.js";
import {
  applyAbilityEffects,
  deriveMaxEnergy,
  deriveMaxHp,
  getAbility,
} from "../../shared/special.js";

// "custom" is a valid path for new games (no preset — the player supplies the
// background, starting location, and stats).
export const ARCHETYPES: Archetype[] = [
  "gladiator",
  "senator",
  "legionary",
  "merchant",
  "freedman",
  "custom",
];

// Per-archetype starting kit and premise. Attributes and maxHp are NOT here:
// stats come from the player's validated allocation (see shared/special.ts) and
// maxHp is derived from Endurance (Vigor).
interface ArchetypePreset {
  gold: number;
  reputation: number;
  inventory: Item[];
  location: string;
  status: PlayerStatus;
  /** Place an enslaved character may not freely leave (engine-gated travel). */
  boundLocation?: string;
  /** Opening situation handed to the GM to seed the first scene. */
  hook: string;
}

const PRESETS: Record<Exclude<Archetype, "custom">, ArchetypePreset> = {
  gladiator: {
    gold: 15,
    reputation: 5,
    inventory: [
      { name: "Gladius", description: "A short, well-balanced iron sword.", qty: 1 },
      { name: "Worn tunic", description: "Coarse, sweat-stained cloth.", qty: 1 },
    ],
    location: "the Ludus Magnus (gladiator school), Rome",
    status: "enslaved",
    boundLocation: "the Ludus Magnus (gladiator school), Rome",
    hook: "You are a slave sworn to the arena, training in the great gladiator school beside the Colosseum. Dawn breaks over the sands; the lanista's whip and the promise of freedom both wait. Your first match approaches.",
  },
  senator: {
    gold: 500,
    reputation: 30,
    inventory: [
      { name: "Senatorial toga", description: "White wool bordered with the broad purple stripe.", qty: 1 },
      { name: "Signet ring", description: "Seals your authority in wax.", qty: 1 },
      { name: "Wax tablet", description: "For notes, debts, and quiet bargains.", qty: 1 },
    ],
    location: "the Forum Romanum, Rome",
    status: "free",
    hook: "You are a senator of Rome in restless times. The Curia hums with rumor of plots between Optimates and Populares; a discreet message reached you at dawn, hinting that your name is spoken in a dangerous conspiracy.",
  },
  legionary: {
    gold: 50,
    reputation: 10,
    inventory: [
      { name: "Gladius", description: "Standard-issue legionary blade.", qty: 1 },
      { name: "Scutum", description: "A large curved shield, the wall of Rome.", qty: 1 },
      { name: "Lorica segmentata", description: "Banded iron armor.", qty: 1 },
    ],
    location: "a frontier castrum on the Rhine",
    status: "free",
    hook: "You are a legionary of Rome posted to a cold fort on the Rhine frontier. Scouts have not returned, the Germanic tribes are stirring beyond the river, and your centurion is calling the contubernium to muster in the grey dawn.",
  },
  merchant: {
    gold: 300,
    reputation: 10,
    inventory: [
      { name: "Ledger", description: "Your accounts, debts owed and owing.", qty: 1 },
      { name: "Coin purse", description: "Heavy with mixed coin.", qty: 1 },
      { name: "Mule", description: "Stubborn but strong; carries your goods.", qty: 1 },
    ],
    location: "the harbor at Ostia",
    status: "free",
    hook: "You are a mercator newly arrived at the teeming port of Ostia, a ship of Egyptian grain and Syrian glass riding at anchor. Fortunes are made and lost here in a morning — and a harbor official is eyeing your cargo with too much interest.",
  },
  freedman: {
    gold: 10,
    reputation: -10,
    inventory: [
      { name: "Rough tunic", description: "Plain, but your own.", qty: 1 },
      { name: "Pileus", description: "The felt cap of a freed slave — proof you are no longer property.", qty: 1 },
    ],
    location: "the Subura, Rome's crowded slums",
    status: "freedman",
    hook: "You are newly freed — a libertus with the felt cap and little else — in the noisy, dangerous Subura. Your former master's patronage is thin, your debts are real, and someone from your enslaved past has just recognized your face in the crowd.",
  },
};

// Defaults for the "custom" path when the player gives no starting location/kit.
const CUSTOM_DEFAULTS = {
  gold: 30,
  reputation: 0,
  location: "the Forum Romanum, Rome",
  status: "free" as PlayerStatus,
  inventory: [
    { name: "Traveler's tunic", description: "Plain, road-worn cloth.", qty: 1 },
    { name: "Coin purse", description: "A handful of mixed coin.", qty: 1 },
  ] as Item[],
};

/** Validated, sanitized creation input (assembled by the /api/game/new route). */
export interface CreateGameInput {
  name: string;
  archetype: Archetype;
  age: number;
  ancestry: string;
  appearance: string;
  background: string; // resolved premise; for presets, may be "" (falls back to the hook)
  stats: Attributes; // validated & clamped, BEFORE ability effects
  abilityNames: string[]; // curated ability names (already filtered & capped)
  customAbility?: { name: string; description: string }; // dev free-text (narrative only)
  startingLocation?: string; // custom path only
}

export function createGame(input: CreateGameInput): GameState {
  const now = new Date().toISOString();
  const isCustom = input.archetype === "custom";
  const preset = isCustom ? null : PRESETS[input.archetype as Exclude<Archetype, "custom">];

  // Bake curated-ability effects into the allocated stats (clamped 1–10).
  const attributes = applyAbilityEffects(input.stats, input.abilityNames);
  const maxHp = deriveMaxHp(attributes.endurance);
  const maxEnergy = deriveMaxEnergy(attributes.endurance);

  // Stored ability tags (name + description) the GM honors. Curated abilities
  // pull their description from the catalog; the dev ability is narrative only.
  const abilities: Ability[] = [];
  for (const name of input.abilityNames) {
    const def = getAbility(name);
    if (def) abilities.push({ name: def.name, description: def.description });
  }
  if (input.customAbility?.name) {
    abilities.push({
      name: input.customAbility.name,
      description: input.customAbility.description,
    });
  }

  const character: Character = {
    name: input.name,
    archetype: input.archetype,
    age: input.age,
    ancestry: input.ancestry,
    appearance: input.appearance,
    background: input.background.trim() || preset?.hook || "",
    attributes,
    abilities,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    gold: preset?.gold ?? CUSTOM_DEFAULTS.gold,
    reputation: preset?.reputation ?? CUSTOM_DEFAULTS.reputation,
    level: 1,
    xp: 0,
    status: preset?.status ?? CUSTOM_DEFAULTS.status,
    boundLocation: preset?.boundLocation,
  };

  const location = isCustom
    ? input.startingLocation?.trim() || CUSTOM_DEFAULTS.location
    : preset!.location;

  const inventory = (isCustom ? CUSTOM_DEFAULTS.inventory : preset!.inventory).map(
    (i) => ({ ...i })
  );

  const world: World = {
    location,
    day: 1,
    timeOfDay: "dawn",
    flags: {},
    npcsPresent: [],
  };

  return {
    id: nanoid(12),
    createdAt: now,
    updatedAt: now,
    status: "active",
    character,
    inventory,
    world,
    transcript: [],
    storySoFar: "",
    journal: { places: [], people: [], days: [], currentDay: 1, dayLog: "" },
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
