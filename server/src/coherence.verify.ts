// Standalone, zero-dependency verification of the Stage-B choice coherence guard.
//
// Pure functions only — no Ollama, no server, no test runner. This deliberately
// keeps the LLM out of the loop (see the `gm-three-stage-design` note about
// contaminated tests misleading) so the assertions are fully deterministic.
//
//   Run:  npx tsx server/src/coherence.verify.ts
//
// Exits non-zero (via node:assert) on the first failed expectation.

import assert from "node:assert/strict";
import type { GameState, Item } from "../../shared/types.js";
import { coherentChoices } from "./turn.js";

/** Minimal GameState carrying only the fields `coherentChoices` reads. */
function makeState(opts: {
  inventory: Item[];
  gold?: number;
  flags?: Record<string, string | number | boolean>;
}): GameState {
  return {
    character: { gold: opts.gold ?? 0 },
    inventory: opts.inventory,
    world: { flags: opts.flags ?? {} },
  } as unknown as GameState;
}

const item = (name: string, equipped = false): Item => ({
  name,
  description: "",
  qty: 1,
  equipped,
});

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- equip / unequip ---------------------------------------------------------
const equipped = makeState({ inventory: [item("Gladius", true)] });
const stowed = makeState({ inventory: [item("Gladius", false)] });

check(
  "unequip kept while the item IS equipped",
  coherentChoices(equipped, [
    { label: "Sheathe your gladius", requires: { unequip: "gladius" } },
  ]).includes("Sheathe your gladius")
);
check(
  "unequip dropped when the item is already stowed",
  coherentChoices(stowed, [
    { label: "Sheathe your gladius", requires: { unequip: "gladius" } },
  ]).length === 0
);
check(
  "equip kept while the item is held but unequipped",
  coherentChoices(stowed, [
    { label: "Draw your gladius", requires: { equip: "gladius" } },
  ]).includes("Draw your gladius")
);
check(
  "equip dropped when the item is already equipped",
  coherentChoices(equipped, [
    { label: "Draw your gladius", requires: { equip: "gladius" } },
  ]).length === 0
);
check(
  "fuzzy item match: 'lorica' resolves an equipped 'Lorica hamata'",
  coherentChoices(makeState({ inventory: [item("Lorica hamata", true)] }), [
    { label: "Strip off your lorica", requires: { unequip: "lorica" } },
  ]).includes("Strip off your lorica")
);

// --- affordability -----------------------------------------------------------
check(
  "gold-gated choice dropped when the player can't afford it",
  coherentChoices(makeState({ inventory: [], gold: 5 }), [
    { label: "Buy bread (10 sst)", requires: { gold: 10 } },
  ]).length === 0
);
check(
  "gold-gated choice kept when affordable",
  coherentChoices(makeState({ inventory: [], gold: 15 }), [
    { label: "Buy bread (10 sst)", requires: { gold: 10 } },
  ]).includes("Buy bread (10 sst)")
);

// --- items not held ----------------------------------------------------------
check(
  "hasItem dropped when the item isn't in the inventory",
  coherentChoices(makeState({ inventory: [item("Gladius")] }), [
    { label: "Read the scroll", requires: { hasItem: "scroll" } },
  ]).length === 0
);
check(
  "hasItem kept when the item is held",
  coherentChoices(makeState({ inventory: [item("Ledger")] }), [
    { label: "Read the ledger", requires: { hasItem: "ledger" } },
  ]).includes("Read the ledger")
);

// --- scene flags -------------------------------------------------------------
const doorOpen = makeState({ inventory: [], flags: { door_open: "true" } });
check(
  "flag-gated choice dropped on a recorded mismatch",
  coherentChoices(doorOpen, [
    { label: "Open the heavy door", requires: { flag: { key: "door_open", equals: "false" } } },
  ]).length === 0
);
check(
  "flag-gated choice kept on a recorded match",
  coherentChoices(doorOpen, [
    { label: "Bar the heavy door", requires: { flag: { key: "door_open", equals: "true" } } },
  ]).includes("Bar the heavy door")
);
check(
  "flag-gated choice kept when the key was never recorded (fail-open)",
  coherentChoices(makeState({ inventory: [] }), [
    { label: "Open the heavy door", requires: { flag: { key: "door_open", equals: "false" } } },
  ]).includes("Open the heavy door")
);

// --- fail-open & shaping -----------------------------------------------------
check(
  "bare-string and requires-less choices are always kept (fail-open)",
  (() => {
    const r = coherentChoices(makeState({ inventory: [] }), [
      "Look around carefully",
      { label: "Press onward" },
    ]);
    return r.includes("Look around carefully") && r.includes("Press onward");
  })()
);
check(
  "all-incoherent input yields an empty list (gm.ts then falls back)",
  coherentChoices(makeState({ inventory: [item("Gladius", false)], gold: 0 }), [
    { label: "Sheathe your gladius", requires: { unequip: "gladius" } },
    { label: "Buy wine (5 sst)", requires: { gold: 5 } },
  ]).length === 0
);
check(
  "survivors are deduped case-insensitively and capped at 4",
  (() => {
    const r = coherentChoices(makeState({ inventory: [] }), [
      "Wait",
      "wait",
      "Look",
      "Listen",
      "Flee",
      "Hide",
    ]);
    return r.length === 4 && r.filter((x) => x.toLowerCase() === "wait").length === 1;
  })()
);

console.log(`\nAll ${passed} coherence checks passed.`);
