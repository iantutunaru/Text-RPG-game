// The Journal's per-day recaps. The journey is logged ONE short paragraph per
// in-game day. Each day's turns accumulate in a working buffer (`journal.dayLog`);
// when the in-game day advances, the engine writes that day's recap ONCE and stores
// it (immutable — a finished day never changes), so the Journal opens instantly with
// no on-open model call. Places, people met, and who's present are recorded
// separately and deterministically (see server/src/turn.ts:recordScene).

import type { GameState, Journal } from "../../shared/types.js";
import type { LLMClient } from "./llm.js";

const DAY_LOG_CAP = 8000; // chars of current-day text kept (head-trimmed) for the recap

const RECAP_SYSTEM =
  "You are writing a single short paragraph for a Roman adventurer's day-journal. Summarize the day's events in 3-5 sentences, in the second person (\"You ...\"), past tense, evocative but factual. Name the key people and places, and note any thread left hanging. Write ONLY the paragraph — no heading, no list, no preamble.";

/** A blank journal, used to heal states that predate the feature. */
function blankJournal(): Journal {
  return { places: [], people: [], days: [], currentDay: 1, dayLog: "" };
}

/** Deterministic fallback recap, used when the buffer is empty or the model call
 *  fails — so every closed day still gets a pane and the cache stays immutable. */
function fallbackRecap(state: GameState, day: number): string {
  return `Day ${day} passed at ${state.world.location}.`;
}

/**
 * Fold the just-finished turn into the current day's buffer, and — if this turn
 * ended the in-game day — write that day's recap once and start the next day.
 *
 * Called after the narration exists (so both the action and its prose are known).
 * Best-effort: a failed recap call falls back to a deterministic line rather than
 * throwing or leaving an empty pane.
 */
export async function recordDay(
  state: GameState,
  action: string,
  narrative: string,
  llm: LLMClient
): Promise<void> {
  const journal = (state.journal ??= blankJournal());

  // Append this turn to the current day's buffer (head-trimmed so a long day can't
  // bloat the save). The transition turn belongs to the day it closes.
  const piece = action
    ? `Player: ${action}\nGM: ${narrative}`
    : `GM: ${narrative}`;
  journal.dayLog = (journal.dayLog ? `${journal.dayLog}\n\n` : "") + piece;
  if (journal.dayLog.length > DAY_LOG_CAP) {
    journal.dayLog = journal.dayLog.slice(-DAY_LOG_CAP);
  }

  // No rollover this turn — keep accumulating.
  if (state.world.day <= journal.currentDay) return;

  // The day ended: write its recap once, then start the new day fresh.
  const endedDay = journal.currentDay;
  let recap = "";
  if (journal.dayLog.trim()) {
    try {
      const result = await llm.chat({
        system: RECAP_SYSTEM,
        messages: [
          {
            role: "user",
            content: `The events of day ${endedDay}:\n${journal.dayLog}\n\nWrite the day's journal paragraph.`,
          },
        ],
        temperature: 0.4,
      });
      recap = result.content.trim();
    } catch {
      // Fall through to the deterministic fallback below.
    }
  }
  journal.days.push({ day: endedDay, recap: recap || fallbackRecap(state, endedDay) });
  journal.dayLog = "";
  journal.currentDay = state.world.day;
}
