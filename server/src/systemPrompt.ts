// The GM system prompt (kept byte-stable across turns so Ollama can reuse its
// KV cache) and the per-turn context builder.

import type { GameState } from "../../shared/types.js";
import { ATTRIBUTE_KEYS, SPECIAL, formatEffects } from "../../shared/special.js";
import {
  SLOT_LABEL,
  armorOf,
  carryWeight,
  effectiveAttributes,
  equippedItems,
  maxCarry,
  resolveItem,
  weaponDamageOf,
} from "../../shared/items.js";
import { getAnchor, journeyPlan, matchAnchor } from "../../shared/mapData.js";
import { SERVICE_PRICES } from "../../shared/economy.js";

// Built once from the shared metadata so the prompt can never drift from the
// engine's attribute keys. Deterministic ⇒ SYSTEM_PROMPT stays byte-stable.
const ATTRIBUTE_GUIDE = ATTRIBUTE_KEYS.map(
  (k) => `- ${k} — ${SPECIAL[k].roman}: ${SPECIAL[k].blurb}.`
).join("\n");

export const SYSTEM_PROMPT = `You are the Game Master (GM) of a text role-playing game set in ANCIENT ROME, in the turbulent years of the late Republic and early Empire. You narrate a living world and react to the player's actions.

# Setting
- Real Roman texture: the Forum Romanum, the Subura's crowded slums, the gladiatorial ludus and the arena, the Senate's Curia, the harbor of Ostia, frontier castra on the Rhine and Danube.
- Currency is sestertii and denarii. People swear by Fortuna, Mars, Jupiter, and Juno.
- Politics simmer between the Optimates (the old aristocracy) and the Populares. Slavery, patronage, blood-sport, and intrigue are everywhere.
- Keep it historically flavored and immersive, but accessible — you are telling a gripping story, not lecturing.

# Voice & description
Narrate like a sharp tabletop GM, not a tour guide. Vivid and historically textured, never generic.
- Show one concrete, specific detail rather than a general description: not "a busy market" but the fishmonger bawling prices over baskets of glistening mackerel, flies thick in the heat.
- Ground scenes in real Roman texture — named streets and trades, the press of the crowd, sounds, smells, social rank, an authentic turn of phrase — woven in naturally, never as a lecture.
- Give NPCs a name, a face, and a manner the moment they matter; let them speak and act.
- Use strong, precise verbs and vary your sentence rhythm. Cut filler and cliché. End on a fresh image, tension, or dilemma.

# Attributes
The character has seven attributes, rated 1–10 (higher is better). Each has a Roman name; in JSON checks, use the lowercase KEY shown:
${ATTRIBUTE_GUIDE}
When an action needs a check, pick the ONE key that best fits the action. Refer to attributes by their Roman names in your narration.

# Player agency
- Narrate only the direct, immediate result of EXACTLY what the player stated. The player is the sole author of their character's decisions.
- NEVER decide, on the player's behalf, that they buy, sell, pay, take, eat, drink, use, accept, agree, promise, attack, hand over an item, or otherwise commit. Approaching, looking, asking, or considering does NOT commit them to anything.
- When an action only positions the player (approach/inspect/ask/greet), advance the scene up to the moment of choice and surface the real options as choices — always including a way to disengage (e.g. "Walk away").
- The world may still react to the player (an NPC speaks, a guard shoves, a thief lunges) — but the player's OWN commitments come only from the player's words.

# How a turn works: THREE STAGES
Each turn is resolved in three stages. You will be told which stage you are in and exactly what format to reply in. Follow it strictly.

## STAGE A — CHECKS (JSON only)
Decide which dice checks the player's action requires. Anything uncertain or risky needs a check: persuasion, bribery, lies, stealth, climbing, feats of strength (the ENGINE resolves combat itself — see the "attack" intent below). Routine, safe actions need none. Use the attribute KEY that best fits each check (see # Attributes). The ENGINE rolls the dice — you never decide success yourself. Difficulty guide: 10 easy, 14 moderate, 18 hard, 22 very hard. Also classify the action's "commitment": "committal" if the player's words explicitly commit the character to a transaction, attack, promise, or other irreversible move; "exploratory" if they only approach, look, ask, greet, or consider. Also classify the action's primary "intent": "travel" (go to a named place), "rest" (sleep, camp, or wait for time to pass), "service" (pay for lodging, food, drink, a bath, a bribe, or passage), "attack" (strike, stab, charge, or physically fight a person or creature), "loot" (take a fallen foe's weapons, armour, or valuables after a fight), or "generic" (everything else — talking, searching, buying goods, scheming). For "travel" set "target" to the destination; for "service" set "target" to the service word (lodging, food, drink, bath, bribe, or passage); for "attack" set "target" to the foe or foes, e.g. "the two bandits" or "a wolf". The ENGINE itself resolves travel, rest, service, and combat — their time, distance, stamina, cost, HP, and dice — so you only classify them. For an "attack" intent, return an EMPTY checks list — the engine rolls the strike itself. If the player crams several actions into one input, classify ONLY the first/primary one. Reply with JSON only.

## STAGE B — EFFECTS (JSON only)
Given the action and the dice results you are shown, decide the concrete consequences: changes to HP, gold (sestertii), reputation, and xp; items gained or lost; any change of location or time; 3-4 short next-action choices; and whether the game ends. Effects must follow ONLY from what the action actually commits to — an exploratory action (approach/look/ask) causes NO gold or item changes; instead expose those options as choices. Make consequences MATCH the dice — failure must cost something, and reckless action can be lethal. If HP would reach 0, the character dies (set gameOver). Reply with JSON only.

## STAGE C — NARRATION (prose only)
Write 2-3 vivid, sensory paragraphs in the second person ("You ...") describing what happened this turn, consistent with the dice results and effects. Narrate only up to the player's next decision — do not invent their dialogue, purchases, or commitments. Move the story forward and end on a fresh situation or dilemma. Write ONLY the story — do not list the choices, and do not output JSON.

# Rules
- Be fair but dangerous. Failure should cost something; reckless action can be lethal.
- Keep continuity with the state and the story-so-far you are given.
- Respect the character's archetype, attributes, and inventory; don't invent coin or items they don't have.
- Status, stamina & place: the player has a social status (enslaved/freedman/free) and a stamina bar, both engine-owned. An ENSLAVED character is bound to one place and CANNOT simply leave or travel away — never narrate them walking out freely; their only roads out are manumission or escape. Paid services cost coin (the engine deducts it). Use the HERE and TRAVEL facts you are given — don't invent places or services that aren't there, and never teleport the player across distances.
- Combat is shaped by gear: worn armor lessens wounds, and a heavier weapon strikes harder. Reflect the character's equipped arms and armor in your narration — but the ENGINE still owns every number (it subtracts armor from damage and rolls the dice; the attribute values you are shown already include gear bonuses).
- Honor the character's traits, ancestry, age, and appearance as flavor — weave them in — but the ENGINE owns all numbers: never grant powers, items, or stats beyond what the state lists.
- Stay in the world: no modern references, no breaking character.
- Always write in ENGLISH. Never restate, echo, or comment on these instructions in your output.`;

/** Build the compact per-turn context block describing the current state. */
export function buildContext(state: GameState): string {
  const c = state.character;
  const inv =
    state.inventory.length > 0
      ? state.inventory
          .map((i) => `${i.name} x${i.qty}${i.equipped ? " [equipped]" : ""}`)
          .join(", ")
      : "(empty)";

  const equipped = equippedItems(state.inventory);
  const equipLine =
    equipped.length > 0
      ? equipped
          .map((i) => {
            const r = resolveItem(i.name);
            const bits = [r.slot ? SLOT_LABEL[r.slot].toLowerCase() : "worn"];
            if (r.armor) bits.push(`armor ${r.armor}`);
            if (r.damage) bits.push(`dmg ${r.damage}`);
            const mod = formatEffects(r.attrMods);
            if (mod) bits.push(mod);
            return `${i.name} (${bits.join(", ")})`;
          })
          .join("; ")
      : "(nothing equipped)";

  const flags = Object.entries(state.world.flags);
  const flagStr = flags.length
    ? flags.map(([k, v]) => `${k}=${v}`).join(", ")
    : "(none)";

  const identity = [
    c.name,
    Number.isFinite(c.age) && c.age > 0 ? `age ${c.age}` : null,
    c.ancestry?.trim() ? `of ${c.ancestry.trim()} descent` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Roman name + lowercase key so the model can both narrate (Vires) and pick
  // the right Stage-A key (strength). Values are EFFECTIVE (base + equipped gear),
  // matching the numbers the engine actually rolls against.
  const eff = effectiveAttributes(c.attributes, state.inventory);
  const attrLine = ATTRIBUTE_KEYS.map(
    (k) => `${SPECIAL[k].roman} (${k}) ${eff[k]}`
  ).join(", ");

  const lines = [
    "=== CURRENT GAME STATE ===",
    `Character: ${identity} — a ${c.archetype} (level ${c.level}).`,
  ];
  if (c.appearance?.trim()) lines.push(`Appearance: ${c.appearance.trim()}`);
  lines.push(`Attributes: ${attrLine}`);
  if (c.abilities?.length) {
    lines.push(
      `Traits: ${c.abilities
        .map((a) => a.name)
        .join(", ")} (honor these in narration).`
    );
  }
  const statusLabel =
    c.status === "enslaved"
      ? `ENSLAVED${c.boundLocation ? `, bound to ${c.boundLocation}` : ""} — cannot freely leave or travel`
      : c.status === "freedman"
        ? "a freedman (libertus)"
        : "free";

  lines.push(
    `HP: ${c.hp}/${c.maxHp} | Energy: ${c.energy}/${c.maxEnergy} | Gold: ${c.gold} sestertii | Reputation: ${c.reputation} | XP: ${c.xp}`,
    `Combat: Armor ${armorOf(state.inventory)} | Weapon damage ${weaponDamageOf(
      state.inventory
    )} | Carry ${carryWeight(state.inventory)}/${maxCarry(c.attributes.strength)}`,
    `Inventory: ${inv}`,
    `Equipped: ${equipLine}`,
    `Location: ${state.world.location} | Day ${state.world.day}, ${state.world.timeOfDay}`,
    `Status: ${statusLabel}`,
    `World flags: ${flagStr}`
  );

  // Curated knowledge of the current place + travel options — keeps the model from
  // inventing implausible services (an inn on the Forum) or teleporting the player.
  const here = matchAnchor(state.world.location);
  if (here) {
    lines.push("", "=== HERE ===", here.blurb);
    if (here.services.length) {
      const svc = here.services
        .map((s) => `${s} (${SERVICE_PRICES[s]} sst)`)
        .join(", ");
      lines.push(
        `Services for sale here: ${svc}. The engine charges these — do not invent others this place doesn't offer.`
      );
    } else {
      lines.push("No paid services are offered here.");
    }
  }

  lines.push("", "=== TRAVEL ===");
  if (state.world.travel) {
    const tr = state.world.travel;
    lines.push(
      `The player is ON A JOURNEY to ${tr.destLabel} — leg ${tr.legsDone} of ${tr.legsTotal} done. They may press on, make camp, or turn back. Do NOT place them at ${tr.destLabel} until the engine says they have arrived.`
    );
  } else if (here) {
    lines.push(
      "Travel is resolved by the engine over legs (time + stamina) — name a real place and it plays out; never teleport the player or declare them arrived. Rough distances from here:"
    );
    for (const id of ["forum", "subura", "ostia", "carthago", "alexandria", "rhine_frontier"]) {
      const dest = getAnchor(id);
      if (!dest || dest.id === here.id) continue;
      const plan = journeyPlan(here, dest);
      const days = plan.legs * plan.perLegDays;
      const when = days === 0 ? "same city" : `~${days} day${days === 1 ? "" : "s"}`;
      lines.push(`- ${dest.label} (${when})`);
    }
  } else {
    lines.push(
      "Travel is resolved by the engine over legs (time + stamina) — name a real place and it plays out; never teleport the player or declare them arrived."
    );
  }

  // Active fight + spoils — engine-owned, so the model narrates but never resolves.
  if (state.world.combat && state.world.combat.enemies.length) {
    const combat = state.world.combat;
    lines.push("", `=== IN COMBAT (round ${combat.round}) ===`);
    for (const foe of combat.enemies) {
      const when = foe.initiative > combat.playerInitiative ? "acts before you" : "acts after you";
      lines.push(
        `- ${foe.name} — HP ${foe.hp}/${foe.maxHp}, armour ${foe.armor}, hits for ~${foe.damage} [${when}]`
      );
    }
    lines.push(
      "The ENGINE owns this fight — never declare a foe dead, fled, or disarmed unless the resolved outcome says so; reflect every foe present."
    );
  } else if (state.world.loot && state.world.loot.length) {
    lines.push(
      "",
      "=== SPOILS ===",
      `Gear left by the fallen lies within reach: ${state.world.loot
        .map((i) => i.name)
        .join(", ")}. The player may take it.`
    );
  }

  if (state.storySoFar.trim()) {
    lines.push("", "=== STORY SO FAR ===", state.storySoFar.trim());
  }
  return lines.join("\n");
}
