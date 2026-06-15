// Standalone, zero-dependency verification of the per-day journal recap logic.
//
// Pure logic driven by a FAKE LLM (no Ollama, no server, no test runner) so the
// assertions are fully deterministic — same spirit as coherence.verify.ts and the
// `gm-three-stage-design` note about keeping the model out of the test loop. This
// matters because the live model won't reliably emit a `dayDelta`, so a real-Ollama
// run can't be relied on to exercise the day-rollover path.
//
//   Run:  npx tsx server/src/journal.verify.ts
//
// Exits non-zero (via node:assert) on the first failed expectation.

import assert from "node:assert/strict";
import type { GameState, Journal } from "../../shared/types.js";
import type { LLMClient } from "./llm.js";
import { recordDay } from "./journal.js";

/** Minimal GameState carrying only the fields `recordDay` reads/writes. */
function makeState(opts: {
  day: number;
  location?: string;
  journal?: Partial<Journal>;
}): GameState {
  return {
    world: {
      day: opts.day,
      location: opts.location ?? "the Forum",
      timeOfDay: "morning",
      flags: {},
    },
    journal: {
      places: [],
      people: [],
      days: [],
      currentDay: opts.day,
      dayLog: "",
      ...opts.journal,
    },
  } as unknown as GameState;
}

const okLlm = {
  chat: async () => ({ content: "  A recap of the day.  " }),
} as unknown as LLMClient;
const failLlm = {
  chat: async () => {
    throw new Error("ollama down");
  },
} as unknown as LLMClient;

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main(): Promise<void> {
  // 1. No rollover: append to the buffer, write no recap.
  {
    const s = makeState({ day: 1, journal: { currentDay: 1, dayLog: "" } });
    await recordDay(s, "Look around", "You see the forum.", okLlm);
    const j = s.journal!;
    check("no rollover keeps currentDay", j.currentDay === 1);
    check("no rollover appends to dayLog", j.dayLog.includes("You see the forum."));
    check("no rollover writes no recap", j.days.length === 0);
  }

  // 2. Rollover: write one recap from the LLM, reset the buffer, advance the day.
  {
    const s = makeState({
      day: 2,
      location: "Ostia",
      journal: { currentDay: 1, dayLog: "Earlier today..." },
    });
    await recordDay(s, "Travel to Ostia", "You walk the road.", okLlm);
    const j = s.journal!;
    check("rollover records exactly one day", j.days.length === 1);
    check("recap labelled with the day that ended", j.days[0].day === 1);
    check("recap is the trimmed LLM text", j.days[0].recap === "A recap of the day.");
    check("rollover resets the buffer", j.dayLog === "");
    check("rollover advances currentDay", j.currentDay === 2);
  }

  // 3. Rollover with a failed LLM call falls back deterministically (no empty pane).
  {
    const s = makeState({
      day: 2,
      location: "Ostia",
      journal: { currentDay: 1, dayLog: "Stuff happened." },
    });
    await recordDay(s, "Travel", "You arrive.", failLlm);
    const j = s.journal!;
    check("failed recap still records a pane", j.days.length === 1);
    check(
      "failed recap uses the deterministic fallback",
      j.days[0].recap === "Day 1 passed at Ostia."
    );
  }

  // 4. Multi-day jump records one recap for the day that ended and skips the gap.
  {
    const s = makeState({ day: 4, journal: { currentDay: 1, dayLog: "A busy day." } });
    await recordDay(s, "Sail for days", "Days pass at sea.", okLlm);
    const j = s.journal!;
    check("multi-day jump records one recap", j.days.length === 1);
    check("multi-day recap labelled the ended day", j.days[0].day === 1);
    check("multi-day jump sets currentDay to the new day", j.currentDay === 4);
  }

  console.log(`\nAll ${passed} journal checks passed.`);
}

main();
