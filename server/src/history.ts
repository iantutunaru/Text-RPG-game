// Narrative history management: keep a bounded window of recent turns verbatim,
// and roll older turns into a compact "story so far" summary so the prompt stays
// small even in long games.

import type { GameState, Turn } from "../../shared/types.js";
import type { LLMClient } from "./llm.js";

export const TRANSCRIPT_WINDOW = 8;

/**
 * Append a completed turn, then — if the transcript has grown past the window —
 * summarize the overflow into `storySoFar`. Best-effort: if the summary call
 * fails, we simply drop the oldest turns rather than crash the game.
 */
export async function recordTurn(
  state: GameState,
  turn: Turn,
  llm: LLMClient
): Promise<void> {
  state.transcript.push(turn);
  if (state.transcript.length <= TRANSCRIPT_WINDOW) return;

  const overflow = state.transcript.slice(
    0,
    state.transcript.length - TRANSCRIPT_WINDOW
  );
  state.transcript = state.transcript.slice(-TRANSCRIPT_WINDOW);

  const overflowText = overflow
    .map((t) =>
      t.action ? `Player: ${t.action}\nGM: ${t.narrative}` : `GM: ${t.narrative}`
    )
    .join("\n\n");

  try {
    const result = await llm.chat({
      system:
        "You compress role-playing game logs into a tight running summary. Preserve named characters, key decisions, items gained or lost, debts, alliances, injuries, and unresolved threads. Be concise and factual.",
      messages: [
        {
          role: "user",
          content: `Existing summary (may be empty):\n${
            state.storySoFar || "(none)"
          }\n\nNew events to fold in:\n${overflowText}\n\nReturn the updated summary as a few short paragraphs.`,
        },
      ],
      temperature: 0.3,
    });
    if (result.content.trim()) state.storySoFar = result.content.trim();
  } catch {
    // Keep the previous summary; the overflow turns are already trimmed.
  }
}
