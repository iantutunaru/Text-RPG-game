// Shared type definitions used by BOTH the server and the client.
// Types only — import these with `import type { ... }` so no runtime/bundler
// coupling exists between the two packages.

export type Archetype =
  | "gladiator"
  | "senator"
  | "legionary"
  | "merchant"
  | "freedman"
  | "custom";

// SPECIAL-style attributes, reskinned for Rome. Keys stay plain English (the
// small model fills these reliably in Stage-A JSON); the Roman display names
// (Vires, Sensus, …) and per-key metadata live in `shared/special.ts`.
export type AttributeKey =
  | "strength"
  | "perception"
  | "endurance"
  | "charisma"
  | "intelligence"
  | "agility"
  | "luck";

export interface Attributes {
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;
}

export interface Item {
  name: string;
  description: string;
  qty: number;
  equipped?: boolean; // worn/wielded — fills its resolved equip slot (see shared/items.ts)
}

// A player request to equip/unequip an item, carried alongside the action text so
// the engine applies the change deterministically while the GM narrates it as a
// turn (see server/src/gm.ts). The item is matched by name against the inventory.
export interface EquipIntent {
  type: "equip" | "unequip";
  item: string;
}

// A chosen special ability. Mechanical effects (if any) are applied to the
// attributes once at creation and are NOT re-applied each turn; this stored
// record is the narrative tag the GM honors. Curated abilities live in
// `shared/special.ts`; a dev free-text ability has no effects.
export interface Ability {
  name: string;
  description: string;
}

export interface Character {
  name: string;
  archetype: Archetype;
  age: number;
  ancestry: string; // narrative flavor, e.g. "Gaul", "Greek" (no mechanics)
  appearance: string; // narrative flavor used for GM descriptions
  background: string; // the premise that seeds the opening scene
  attributes: Attributes;
  abilities: Ability[];
  hp: number;
  maxHp: number;
  gold: number; // sestertii
  reputation: number; // -100 .. 100
  level: number;
  xp: number;
}

export type TimeOfDay =
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

export interface World {
  location: string;
  day: number;
  timeOfDay: TimeOfDay;
  flags: Record<string, string | number | boolean>;
}

// ---- Maps ----

// Which background image the "you are here" marker is pinned on.
export type MapView = "world" | "rome";

// The biome/template that drives the procedural local (ASCII) map.
export type LocalTheme =
  | "slum"
  | "forum"
  | "ludus"
  | "arena"
  | "harbor"
  | "castrum"
  | "wilderness"
  | "villa"
  | "temple"
  | "market"
  | "generic";

// One generated tile of the local map. `rows` is CHUNK_H strings of CHUNK_W
// chars (see server/src/mapGen.ts). Terrain only — the player glyph is overlaid
// by the client so chunks stay reusable.
export interface LocalChunk {
  cx: number;
  cy: number;
  theme: LocalTheme;
  rows: string[];
}

// Derived, code-owned map state. Computed server-side from `world.location`
// after every turn; never sent to or chosen by the LLM.
export interface MapState {
  anchorId: string | null; // matched landmark for the current location
  view: MapView; // which image the marker sits on
  theme: LocalTheme; // current local-map biome
  loc: string; // the location string this map currently reflects
  pos: { cx: number; cy: number; x: number; y: number }; // player chunk + cell
  chunks: LocalChunk[]; // revealed chunks for the CURRENT region
}

export interface Turn {
  action: string; // the player's action ("" for the opening scene)
  narrative: string; // the GM's narration
}

export type GameStatus = "active" | "ended";

export interface Ending {
  outcome: string; // e.g. "death", "victory", "freedom"
  epitaph: string;
}

export interface GameState {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: GameStatus;
  ending?: Ending;
  character: Character;
  inventory: Item[];
  world: World;
  transcript: Turn[]; // recent narration window (older turns are summarized)
  storySoFar: string; // rolling summary of events that scrolled out of the window
  lastChoices?: string[]; // choices offered on the most recent turn (for resume)
  map?: MapState; // derived world/local map state (optional on pre-feature saves)
}

// ---- Dice / checks ----

export interface RollResult {
  attribute: AttributeKey;
  difficulty: number;
  roll: number; // raw d20
  modifier: number; // attribute contribution
  total: number; // roll + modifier
  success: boolean;
  margin: number; // total - difficulty
  reason: string;
}

// ---- Wire payloads ----

export interface NewGameRequest {
  name: string;
  archetype: Archetype;
  age: number;
  ancestry: string;
  appearance: string;
  background: string; // required for the "custom" path; optional color otherwise
  stats: Attributes; // the player's allocated SPECIAL values (validated server-side)
  abilityNames: string[]; // ids/names of curated abilities chosen
  customAbility?: { name: string; description: string }; // dev-mode free-text ability
  startingLocation?: string; // "custom" path only
  devMode?: boolean; // unlocks manual stats / custom ability; bypasses the point budget
}

export interface TurnResult {
  state: GameState;
  narrative: string;
  choices: string[];
  rolls: RollResult[];
}

// Events streamed from the server over SSE during an action.
export type ServerEvent =
  | { type: "token"; text: string }
  | { type: "roll"; roll: RollResult }
  | { type: "done"; result: TurnResult }
  | { type: "error"; message: string };
