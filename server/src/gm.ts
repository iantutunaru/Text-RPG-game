// The Game Master engine.
//
// A turn runs in three stages, designed for reliability on a small local model:
//   A. Decide which dice checks the action needs  (forced JSON) -> engine rolls
//   B. Decide mechanical effects + choices + ending (forced JSON) -> engine applies
//   C. Narrate the result as prose                 (streamed, no tools/JSON)
// The engine owns all numbers and dice; the model only proposes and narrates.

import type {
  EquipIntent,
  GameState,
  RollResult,
  TurnResult,
} from "../../shared/types.js";
import type { LLMClient, LLMMessage } from "./llm.js";
import { SYSTEM_PROMPT, buildContext } from "./systemPrompt.js";
import {
  CHECKS_SCHEMA,
  RESOLVE_SCHEMA,
  applyChecks,
  applyEquip,
  applyResolution,
  newEffects,
  parseJSON,
  readCommitment,
  recordScene,
} from "./turn.js";
import { recordTurn } from "./history.js";
import { recordDay } from "./journal.js";
import { updateMap } from "./mapEngine.js";
import { saveGame } from "./persistence.js";

const FALLBACK_CHOICES = [
  "Look around carefully",
  "Press onward",
  "Check your belongings",
  "Speak to someone nearby",
];

export interface RunTurnOptions {
  onToken?: (text: string) => void;
  onRoll?: (roll: RollResult) => void;
}

export async function runTurn(
  state: GameState,
  playerAction: string,
  llm: LLMClient,
  opts: RunTurnOptions = {},
  intent?: EquipIntent
): Promise<TurnResult> {
  // A player equip/unequip is applied deterministically up front, so this turn's
  // context and narration already reflect the new gear. The normal three stages
  // then run — so equipping costs a turn and the world still gets to react
  // (you can't freely armor up in the middle of a fight).
  if (intent) applyEquip(state, intent);

  // Recent narrative as prior conversation, for continuity.
  const base: LLMMessage[] = [];
  for (const t of state.transcript) {
    base.push({ role: "user", content: t.action || "[Begin the story.]" });
    base.push({ role: "assistant", content: t.narrative });
  }

  // On the opening turn (empty action) seed the scene from the character's
  // premise — the archetype hook, or the player's written background (custom).
  const premise = state.character.background?.trim();
  const actionText =
    playerAction.trim() ||
    `Begin the adventure.${
      premise ? ` The character's situation: ${premise}` : ""
    } Establish the opening scene from this premise and the character's identity, then present the first choices.`;

  base.push({
    role: "user",
    content: `${buildContext(state)}\n\n=== PLAYER ACTION ===\n${actionText}`,
  });

  const effects = newEffects();

  // --- Stage A: which checks does this action require? ---
  const checksResp = await llm.chat({
    system: SYSTEM_PROMPT,
    messages: [
      ...base,
      {
        role: "user",
        content:
          "STAGE A. List the dice checks this action requires (combat, persuasion, stealth, feats of strength, etc.). If the action is routine and certain, return an empty list. Respond as JSON only.",
      },
    ],
    format: CHECKS_SCHEMA,
    temperature: 0.4,
  });
  const checksParsed = parseJSON(checksResp.content);
  const commitment = readCommitment(checksParsed);
  const checkSummary = applyChecks(state, checksParsed.checks, effects);
  for (const roll of effects.rolls) opts.onRoll?.(roll);

  // The dice results become shared context for stages B and C.
  const withRolls: LLMMessage[] = [
    ...base,
    { role: "assistant", content: checkSummary },
  ];

  // --- Stage B: mechanical effects, choices, ending ---
  const agencyNote =
    commitment === "exploratory"
      ? ' The player\'s action is exploratory and commits to nothing: apply NO purchase, sale, item transfer, or gold spend (no goldDelta below 0, no addItems/removeItems). Instead, surface those options as choices — e.g. "Buy the grapes (2 sst)", "Haggle the price", "Ask about the unrest", "Walk away".'
      : " When the player buys, takes, loots, or is given an item, you MUST list it in `addItems` AND deduct its price in `goldDelta` — gold spent and goods received must stay consistent, so anything the player paid for has to appear in the inventory.";
  const resolveResp = await llm.chat({
    system: SYSTEM_PROMPT,
    messages: [
      ...withRolls,
      {
        role: "user",
        content:
          "STAGE B. Given the action and the dice results, output the mechanical effects (stat deltas, item changes, scene changes), the choices, and whether the game ends. Make consequences match the dice — failure should cost something." +
          agencyNote +
          " For `choices`, give 3-4 SHORT imperative next actions of about 3-8 words each (e.g. \"Press the attack\", \"Loot the body\", \"Call for the lanista\") — not full sentences. Each choice is an object with a `label`. When a choice only makes sense in a particular state, add a `requires` so the engine can hide it otherwise — ONLY when it genuinely applies: `unequip` (item that must be currently equipped, e.g. \"Sheathe your gladius\"), `equip` (item held but not yet worn, e.g. \"Draw your gladius\"), `hasItem` (item that must be in the inventory to use/give/drop), `gold` (minimum sestertii needed, e.g. 4 for \"Buy bread (4 sst)\"), or `flag` ({key, equals}) to gate on a scene fact. Omit `requires` for plain choices. Use `setFlags` (key/value pairs, e.g. door_open=true) to record durable scene facts you may gate later choices on. Use `npcsPresent` to list the named NPCs physically present with the player at the END of this turn — each an object with a `name` and a short `note` (their role or manner, e.g. {\"name\":\"Gaius\",\"note\":\"the lanista\"}); leave it empty if the player is alone. Respond as JSON only.",
      },
    ],
    format: RESOLVE_SCHEMA,
    temperature: 0.5,
  });
  const resolved = parseJSON(resolveResp.content);
  applyResolution(state, resolved, effects, commitment);
  recordScene(state, resolved); // log journal places/people + who's present now
  updateMap(state); // derive world/local map from the (possibly new) location

  const effectsSummary = summarizeEffects(state, effects);

  // --- Stage C: streamed prose narration (no tools, no JSON) ---
  const narrationResp = await llm.chat({
    system: SYSTEM_PROMPT,
    messages: [
      ...withRolls,
      { role: "assistant", content: effectsSummary },
      {
        role: "user",
        content:
          `STAGE C. Narrate this turn in ENGLISH, in 2-3 vivid, second-person paragraphs, consistent with the dice results and effects above. The player did ONLY this: "${actionText}". Narrate that and the world's immediate reaction, then STOP at the player's next decision — do NOT have them buy, take, eat, drink, pay for, agree to, or say anything they did not state. Write ONLY the story prose — no choices, no lists, no JSON, and no notes about these instructions.`,
      },
    ],
    stream: true,
    temperature: 0.7,
    onToken: opts.onToken,
  });
  const narrative =
    narrationResp.content.trim() || "The moment passes in tense silence.";

  const choices = effects.ended
    ? []
    : effects.choices && effects.choices.length
    ? effects.choices
    : FALLBACK_CHOICES;

  state.lastChoices = choices;
  await recordTurn(state, { action: playerAction, narrative }, llm);
  await recordDay(state, playerAction, narrative, llm); // per-day journal recap at day's end
  await saveGame(state);

  return { state, narrative, choices, rolls: effects.rolls };
}

function summarizeEffects(state: GameState, effects: ReturnType<typeof newEffects>): string {
  const c = state.character;
  const parts = [
    `Applied effects — HP ${c.hp}/${c.maxHp}, gold ${c.gold}, reputation ${c.reputation}, level ${c.level}.`,
    `Location: ${state.world.location} (day ${state.world.day}, ${state.world.timeOfDay}).`,
  ];
  if (effects.encumbered.length)
    parts.push(
      `Could not be carried (too heavy, left behind): ${effects.encumbered.join(
        ", "
      )}.`
    );
  if (effects.ended) parts.push(`The game has ended (${state.ending?.outcome}).`);
  return parts.join(" ");
}
