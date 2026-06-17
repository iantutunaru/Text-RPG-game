import { useRef, useState, type FormEvent } from "react";
import type { IntentVerb, World } from "@shared";

// A player turn is a VERB the player declares + an optional OBJECT they type
// ("Attack" → whom?, "Go" → where?). Each verb maps 1:1 to an engine intent
// server-side (shared/types.ts:IntentVerb, server/src/turn.ts:VERB_INTENT), so the
// engine never has to guess the intent. The `phrase` is the natural action text fed
// to the narrator and stored in the transcript.
interface VerbDef {
  verb: IntentVerb;
  label: string; // unique within its state's set; the leading glyph is stripped for the Act button
  placeholder: string;
  object: "required" | "optional" | "none";
  phrase: (obj: string) => string;
}

// Normal state — the full set of engine verbs.
const ATTACK: VerbDef = { verb: "attack", label: "⚔ Attack", placeholder: "Whom do you attack?", object: "required", phrase: (o) => `Attack ${o}` };
const GO: VerbDef = { verb: "go", label: "🧭 Go", placeholder: "Where to? (e.g. Ostia, the Subura)", object: "required", phrase: (o) => `Go to ${o}` };
const TALK: VerbDef = { verb: "talk", label: "💬 Talk", placeholder: "To whom, and about what?", object: "required", phrase: (o) => `Talk to ${o}` };
const EXAMINE: VerbDef = { verb: "examine", label: "🔍 Examine", placeholder: "Examine what? (blank = look around)", object: "optional", phrase: (o) => (o ? `Examine ${o}` : "Look around") };
const TAKE: VerbDef = { verb: "take", label: "✋ Take", placeholder: "Take what? (blank = all spoils)", object: "optional", phrase: (o) => (o ? `Take ${o}` : "Take the spoils") };
const PAY: VerbDef = { verb: "pay", label: "🪙 Pay", placeholder: "Pay for what? (a room, a meal, a bribe…)", object: "required", phrase: (o) => `Pay for ${o}` };
const REST: VerbDef = { verb: "rest", label: "😴 Rest", placeholder: "Rest and recover your strength.", object: "none", phrase: () => "Rest" };
const OTHER: VerbDef = { verb: "other", label: "✒ Other", placeholder: "Describe your own action…", object: "required", phrase: (o) => o };

// Combat — only these make sense; the contextual bar replaces the old suggested choices.
const PRESS: VerbDef = { verb: "attack", label: "⚔ Attack", placeholder: "Whom? (blank = your current foe)", object: "optional", phrase: (o) => (o ? `Attack ${o}` : "Press the attack") };
const FLEE: VerbDef = { verb: "flee", label: "🏃 Flee", placeholder: "Break away from the fight.", object: "none", phrase: () => "Flee" };

// Mid-journey.
const PRESS_ON: VerbDef = { verb: "go", label: "🧭 Press on", placeholder: "Press on (or name a detour).", object: "optional", phrase: (o) => (o ? `Go to ${o}` : "Press on") };
const MAKE_CAMP: VerbDef = { verb: "rest", label: "🏕 Make camp", placeholder: "Make camp and rest on the road.", object: "none", phrase: () => "Make camp" };
const TURN_BACK: VerbDef = { verb: "go", label: "↩ Turn back", placeholder: "Abandon the journey and return.", object: "none", phrase: () => "Turn back" };

/** The verbs offered for the current state. Combat and travel show a focused set
 *  (this is what replaces the engine's old suggested-choice buttons). */
function verbsForState(world: World): VerbDef[] {
  if (world.combat?.enemies.length) return [PRESS, FLEE, EXAMINE, OTHER];
  if (world.travel) return [PRESS_ON, MAKE_CAMP, TURN_BACK, EXAMINE, OTHER];
  return [ATTACK, GO, TALK, EXAMINE, TAKE, PAY, REST, OTHER];
}

interface Props {
  disabled: boolean;
  world: World;
  onSubmit: (action: string, verb: IntentVerb) => void;
}

export default function ActionInput({ disabled, world, onSubmit }: Props) {
  const [obj, setObj] = useState("");
  const [activeLabel, setActiveLabel] = useState(OTHER.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const verbs = verbsForState(world);
  // OTHER is present in every set, so this fallback always resolves.
  const active = verbs.find((v) => v.label === activeLabel) ?? OTHER;

  function fire(def: VerbDef, raw: string) {
    if (disabled) return;
    const action = def.phrase(raw.trim());
    if (!action.trim()) return;
    onSubmit(action, def.verb);
    setObj("");
  }

  function pick(def: VerbDef) {
    if (def.object === "none") {
      fire(def, ""); // needs no object — act at once
      return;
    }
    setActiveLabel(def.label);
    inputRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (active.object === "required" && !obj.trim()) return;
    fire(active, obj);
  }

  const actDisabled = disabled || (active.object === "required" && !obj.trim());

  return (
    <div className="space-y-2">
      {/* Verb bar — declare the intent, then type its object below. */}
      <div className="flex flex-wrap gap-2">
        {verbs.map((v) => {
          const selected = v.object !== "none" && v.label === active.label;
          return (
            <button
              key={v.label}
              type="button"
              onClick={() => pick(v)}
              disabled={disabled}
              className={`rounded-md border px-3 py-1.5 text-sm font-display uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? "border-[var(--color-gold)] bg-stone-800 text-[var(--color-gold)]"
                  : "border-stone-700 bg-stone-800/50 text-stone-300 hover:border-stone-500"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Object for the selected verb. */}
      <form onSubmit={submit} className="flex gap-2">
        <input
          ref={inputRef}
          value={obj}
          onChange={(e) => setObj(e.target.value)}
          disabled={disabled}
          placeholder={active.placeholder}
          className="flex-1 rounded-md border border-stone-700 bg-stone-800/70 px-4 py-3 text-parchment placeholder-stone-500 outline-none focus:border-[var(--color-gold)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={actDisabled}
          className="rounded-md bg-[var(--color-terracotta)] px-5 py-3 font-display uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {active.verb === "other" ? "Act" : active.label.replace(/^\S+\s/, "")}
        </button>
      </form>
    </div>
  );
}
