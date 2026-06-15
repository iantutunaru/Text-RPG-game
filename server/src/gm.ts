// The Game Master engine.
//
// A turn runs in three stages, designed for reliability on a small local model:
//   A. Decide which dice checks the action needs  (forced JSON) -> engine rolls
//   B. Decide mechanical effects + choices + ending (forced JSON) -> engine applies
//   C. Narrate the result as prose                 (streamed, no tools/JSON)
// The engine owns all numbers and dice; the model only proposes and narrates.

import type { GameState, RollResult, TurnResult } from "../../shared/types.js";
import type { LLMClient, LLMMessage } from "./llm.js";
import { SYSTEM_PROMPT, buildContext } from "./systemPrompt.js";
import {
  CHECKS_SCHEMA,
  RESOLVE_SCHEMA,
  applyChecks,
  applyResolution,
  newEffects,
  parseJSON,
  readCommitment,
} from "./turn.js";
import { recordTurn } from "./history.js";
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
  opts: RunTurnOptions = {}
): Promise<TurnResult> {
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
          " For `choices`, give 3-4 SHORT imperative next actions of about 3-8 words each (e.g. \"Press the attack\", \"Loot the body\", \"Call for the lanista\") — not full sentences. Respond as JSON only.",
      },
    ],
    format: RESOLVE_SCHEMA,
    temperature: 0.5,
  });
  applyResolution(state, parseJSON(resolveResp.content), effects, commitment);
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
  await saveGame(state);

  return { state, narrative, choices, rolls: effects.rolls };
}

function summarizeEffects(state: GameState, effects: ReturnType<typeof newEffects>): string {
  const c = state.character;
  const parts = [
    `Applied effects — HP ${c.hp}/${c.maxHp}, gold ${c.gold}, reputation ${c.reputation}, level ${c.level}.`,
    `Location: ${state.world.location} (day ${state.world.day}, ${state.world.timeOfDay}).`,
  ];
  if (effects.ended) parts.push(`The game has ended (${state.ending?.outcome}).`);
  return parts.join(" ");
}
