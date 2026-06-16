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

// Legal/social standing — drives engine-owned movement gating. An "enslaved"
// character is bound to `boundLocation` and cannot freely travel away; only the
// ENGINE (never the model) changes this, on manumission. See server/src/actions.ts.
export type PlayerStatus = "enslaved" | "freedman" | "free";

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
  energy: number; // stamina vital — drained by action, restored by rest (engine-owned)
  maxEnergy: number; // derived from Endurance (Vigor), like maxHp
  gold: number; // sestertii
  reputation: number; // -100 .. 100
  level: number;
  xp: number;
  status: PlayerStatus; // enslaved / freedman / free — gates travel
  boundLocation?: string; // place an enslaved character may not leave (e.g. the ludus)
}

export type TimeOfDay =
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

// A paid service the engine charges for deterministically (the model never sets
// the price). Price table lives in shared/economy.ts.
export type ServiceKind =
  | "lodging"
  | "food"
  | "drink"
  | "bath"
  | "bribe"
  | "passage";

// An in-progress journey, owned by the engine. Travel plays out over several
// turns — one leg at a time — so distance and danger matter and teleporting is
// impossible. Cleared on arrival or when the player turns back. See
// server/src/actions.ts:resolveTravel.
export interface TravelState {
  destAnchorId: string; // map anchor being traveled to
  destLabel: string; // human location string set on arrival
  fromLabel: string; // where the journey began (used when the player turns back)
  legsTotal: number; // legs the whole journey takes
  legsDone: number; // legs completed so far
  perLegDays: number; // in-game days each leg costs
  perLegEnergy: number; // energy each leg drains
}

// ---- Combat ----

// A single foe in an active fight. Like an Item, an enemy is the model's to NAME
// and the engine's to STAT: `resolveEnemy` (shared/enemies.ts) composes the named
// foe from parts (species + origin + rank + gear + role) into these numbers, and
// the engine owns every one of them thereafter. The gear it carries is kept so a
// slain foe can drop it as loot.
export interface Enemy {
  name: string; // display name, e.g. "a veteran Gaulish spearman" (model-named)
  kind: string; // matched preset/species — for context & display only
  hp: number;
  maxHp: number;
  armor: number; // damage soaked from each player hit (derived from gear)
  damage: number; // damage dealt to the player per swing (pre-armor)
  defenseDc: number; // DC the player's to-hit roll must beat
  initMod: number; // static initiative modifier (species + rank + role)
  initiative: number; // d20 + initMod, rolled once at encounter start; turn order vs. the player
  weapon?: string; // gear item name (loot + flavor); absent for unarmed foes / beasts
  armorItems?: string[]; // gear item names worn (loot); absent for beasts
}

// An active combat encounter — engine-owned and transient (absent ⇒ no fight).
// Each player attack resolves ONE round; combatants act in descending initiative
// order, so a foe faster than the player strikes before the player does. Cleared
// on victory, death, or a successful flee. See server/src/actions.ts:resolveAttack.
export interface CombatState {
  enemies: Enemy[]; // living foes; emptied ⇒ the encounter is over (victory)
  playerInitiative: number; // the player's rolled initiative for this encounter
  round: number; // rounds resolved so far (1-based once the fight begins)
}

export interface World {
  location: string;
  day: number;
  timeOfDay: TimeOfDay;
  flags: Record<string, string | number | boolean>;
  // Named NPCs the GM reports as physically present this turn. Best-effort and
  // advisory (the model proposes it; the engine just records it), like the
  // derived map — never a mechanical gate. Replaced each turn, so an NPC leaving
  // simply drops off the list. Optional on pre-feature saves.
  npcsPresent?: ScenePresence[];
  travel?: TravelState; // set while a multi-leg journey is underway; else absent
  combat?: CombatState; // set while a fight is underway; else absent
  loot?: Item[]; // gear dropped by slain foes, awaiting pickup; cleared when taken or left behind
}

// ---- Journal ----

// One NPC the GM reports as present in the current scene.
export interface ScenePresence {
  name: string;
  note?: string; // brief descriptor, e.g. "the lanista", "a fishmonger"
}

// A journal record of an NPC the player has met (logged once, never removed).
export interface MetNpc {
  name: string;
  note?: string;
  firstSeenLocation: string;
  day: number; // game day first met
}

// A journal record of a location the player has visited (deduped by name).
export interface VisitedPlace {
  name: string;
  day: number; // game day first visited
  timeOfDay: TimeOfDay;
}

// One finished day's recap — a short paragraph written when the in-game day
// ended (see server/src/journal.ts:recordDay). Immutable once recorded.
export interface DayRecap {
  day: number;
  recap: string;
}

// Auto-maintained chronicle of the playthrough. Places and people are recorded
// deterministically each turn by the engine (see server/src/turn.ts:recordScene).
// The journey is logged one paragraph PER IN-GAME DAY: each day's events accumulate
// in `dayLog`, and when the day advances the engine writes a recap into `days` once
// (cached forever — a finished day never changes), so the Journal opens instantly.
export interface Journal {
  places: VisitedPlace[];
  people: MetNpc[];
  days: DayRecap[]; // finished-day recaps, in order (immutable; never regenerated)
  currentDay: number; // the in-game day currently being accumulated
  dayLog: string; // working buffer: this day's turn text (capped), source for its recap
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
  journal?: Journal; // visited places, NPCs met, chronicle (optional on old saves)
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
