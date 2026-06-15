import { useState } from "react";
import type { Archetype } from "@shared";

interface ArchetypeInfo {
  key: Archetype;
  name: string;
  blurb: string;
  icon: string;
}

const ARCHETYPES: ArchetypeInfo[] = [
  {
    key: "gladiator",
    name: "Gladiator",
    blurb: "A slave of the arena, fighting for glory and a slim chance at freedom.",
    icon: "⚔️",
  },
  {
    key: "senator",
    name: "Senator",
    blurb: "A patrician navigating the Senate's deadly games of power.",
    icon: "🏛️",
  },
  {
    key: "legionary",
    name: "Legionary",
    blurb: "A soldier of Rome holding the wild and bloody frontier.",
    icon: "🛡️",
  },
  {
    key: "merchant",
    name: "Merchant",
    blurb: "A trader chasing fortune through the docks and markets of the empire.",
    icon: "⚖️",
  },
  {
    key: "freedman",
    name: "Freedman",
    blurb: "A newly freed slave clawing upward from the Subura's slums.",
    icon: "🗝️",
  },
];

interface Props {
  onCreate: (name: string, archetype: Archetype) => void;
  creating: boolean;
  error: string | null;
}

export default function CharacterCreation({ onCreate, creating, error }: Props) {
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState<Archetype | null>(null);

  const canStart = name.trim().length > 0 && archetype !== null && !creating;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center px-4 py-12">
      <h1 className="font-display text-5xl tracking-wide text-[var(--color-gold)]">
        ROMA
      </h1>
      <p className="mt-2 text-center text-lg text-stone-300">
        A text RPG of ancient Rome, narrated by a Game Master that lives on your
        own machine.
      </p>

      <div className="mt-10 w-full">
        <label className="font-display text-sm uppercase tracking-widest text-stone-400">
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Marcus Aurelius"
          disabled={creating}
          className="mt-2 w-full rounded-md border border-stone-700 bg-stone-800/70 px-4 py-3 text-lg text-parchment placeholder-stone-500 outline-none focus:border-[var(--color-gold)]"
        />
      </div>

      <div className="mt-8 w-full">
        <p className="font-display text-sm uppercase tracking-widest text-stone-400">
          Choose your path
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ARCHETYPES.map((a) => {
            const selected = archetype === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setArchetype(a.key)}
                disabled={creating}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                  selected
                    ? "border-[var(--color-gold)] bg-stone-800 ring-1 ring-[var(--color-gold)]"
                    : "border-stone-700 bg-stone-800/40 hover:border-stone-500"
                }`}
              >
                <span className="text-2xl">{a.icon}</span>
                <span>
                  <span className="block font-display text-lg text-[var(--color-gold)]">
                    {a.name}
                  </span>
                  <span className="block text-sm text-stone-300">{a.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <button
        onClick={() => archetype && onCreate(name.trim(), archetype)}
        disabled={!canStart}
        className="mt-8 w-full rounded-md bg-[var(--color-terracotta)] px-6 py-4 font-display text-lg uppercase tracking-widest text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {creating ? "Entering Rome…" : "Begin Your Tale"}
      </button>
      {creating && (
        <p className="mt-3 text-sm text-stone-400">
          The Game Master is setting the scene — this can take a moment on first
          run while the model warms up.
        </p>
      )}
    </div>
  );
}
