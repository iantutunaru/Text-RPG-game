import { useState } from "react";
import type { Archetype, AttributeKey, Attributes, NewGameRequest } from "@shared";
import {
  ABILITIES,
  ANCESTRIES,
  ATTRIBUTE_KEYS,
  MAX_ABILITIES,
  POINT_POOL,
  SPECIAL,
  STAT_MAX,
  STAT_MIN,
  archetypeBaseline,
  statTotal,
} from "../../../shared/special";

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
  {
    key: "custom",
    name: "Custom",
    blurb: "Forge your own path — write your background and choose where the story begins.",
    icon: "✒️",
  },
];

const SUGGESTED_LOCATIONS = [
  "the Forum Romanum, Rome",
  "the Subura, Rome's crowded slums",
  "the Ludus Magnus (gladiator school), Rome",
  "the harbor at Ostia",
  "a frontier castrum on the Rhine",
  "the Campus Martius, Rome",
  "a villa in the Alban Hills",
];

function formatEffects(effects: Partial<Record<AttributeKey, number>>): string {
  return ATTRIBUTE_KEYS.filter((k) => effects[k])
    .map((k) => {
      const v = effects[k] as number;
      return `${v > 0 ? "+" : "−"}${Math.abs(v)} ${SPECIAL[k].roman}`;
    })
    .join(", ");
}

const labelCls = "font-display text-sm uppercase tracking-widest text-stone-400";
const inputCls =
  "mt-2 w-full rounded-md border border-stone-700 bg-stone-800/70 px-4 py-3 text-parchment placeholder-stone-500 outline-none focus:border-[var(--color-gold)] disabled:opacity-50";

interface Props {
  onCreate: (req: NewGameRequest) => void;
  creating: boolean;
  error: string | null;
}

export default function CharacterCreation({ onCreate, creating, error }: Props) {
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [age, setAge] = useState(25);
  const [ancestry, setAncestry] = useState("Roman");
  const [appearance, setAppearance] = useState("");
  const [background, setBackground] = useState("");
  const [startingLocation, setStartingLocation] = useState("");
  const [stats, setStats] = useState<Attributes>(archetypeBaseline("custom"));
  const [abilities, setAbilities] = useState<string[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [customAbilityName, setCustomAbilityName] = useState("");
  const [customAbilityDesc, setCustomAbilityDesc] = useState("");

  const baseline = archetypeBaseline(archetype ?? "custom");
  const remaining = POINT_POOL - (statTotal(stats) - statTotal(baseline));
  const isCustom = archetype === "custom";

  function selectArchetype(key: Archetype) {
    setArchetype(key);
    setStats(archetypeBaseline(key)); // reset allocation to the new path's spread
  }

  function adjust(k: AttributeKey, delta: number) {
    setStats((s) => {
      const floor = devMode ? STAT_MIN : baseline[k];
      const next = s[k] + delta;
      if (next < floor || next > STAT_MAX) return s;
      if (!devMode && delta > 0 && statTotal(s) - statTotal(baseline) >= POINT_POOL) {
        return s;
      }
      return { ...s, [k]: next };
    });
  }

  function toggleAbility(abName: string) {
    setAbilities((cur) =>
      cur.includes(abName)
        ? cur.filter((n) => n !== abName)
        : cur.length >= MAX_ABILITIES
        ? cur
        : [...cur, abName]
    );
  }

  const canStart =
    name.trim().length > 0 &&
    archetype !== null &&
    (!isCustom || background.trim().length > 0) &&
    !creating;

  function handleStart() {
    if (!archetype || !canStart) return;
    const req: NewGameRequest = {
      name: name.trim(),
      archetype,
      age,
      ancestry: ancestry.trim() || "Roman",
      appearance: appearance.trim(),
      background: background.trim(),
      stats,
      abilityNames: abilities,
      devMode,
    };
    if (devMode && customAbilityName.trim()) {
      req.customAbility = {
        name: customAbilityName.trim(),
        description: customAbilityDesc.trim(),
      };
    }
    if (isCustom && startingLocation.trim()) {
      req.startingLocation = startingLocation.trim();
    }
    onCreate(req);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center px-4 py-12">
      <h1 className="font-display text-5xl tracking-wide text-[var(--color-gold)]">
        ROMA
      </h1>
      <p className="mt-2 text-center text-lg text-stone-300">
        A text RPG of ancient Rome, narrated by a Game Master that lives on your
        own machine.
      </p>

      {/* Name */}
      <div className="mt-10 w-full">
        <label className={labelCls}>Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Marcus Aurelius"
          disabled={creating}
          className={`${inputCls} text-lg`}
        />
      </div>

      {/* Path */}
      <div className="mt-8 w-full">
        <p className={labelCls}>Choose your path</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ARCHETYPES.map((a) => {
            const selected = archetype === a.key;
            return (
              <button
                key={a.key}
                onClick={() => selectArchetype(a.key)}
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

      {/* The rest of the sheet appears once a path is chosen */}
      {archetype && (
        <>
          {/* Identity */}
          <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Age</label>
              <input
                type="number"
                min={12}
                max={90}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                disabled={creating}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ancestry</label>
              <input
                list="roma-ancestries"
                value={ancestry}
                onChange={(e) => setAncestry(e.target.value)}
                maxLength={40}
                placeholder="e.g. Gaul"
                disabled={creating}
                className={inputCls}
              />
              <datalist id="roma-ancestries">
                {ANCESTRIES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="mt-4 w-full">
            <label className={labelCls}>Appearance</label>
            <textarea
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="A weathered face, a soldier's scar, eyes that miss nothing…"
              disabled={creating}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="mt-4 w-full">
            <label className={labelCls}>
              Background{" "}
              <span className="lowercase tracking-normal text-stone-500">
                {isCustom ? "(required — this sets your opening scene)" : "(optional flavor)"}
              </span>
            </label>
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              maxLength={600}
              rows={3}
              placeholder={
                isCustom
                  ? "Who are you, and what trouble finds you as the story opens?"
                  : "Add any personal history the Game Master should know…"
              }
              disabled={creating}
              className={`${inputCls} resize-none`}
            />
          </div>

          {isCustom && (
            <div className="mt-4 w-full">
              <label className={labelCls}>Starting location</label>
              <input
                list="roma-locations"
                value={startingLocation}
                onChange={(e) => setStartingLocation(e.target.value)}
                maxLength={80}
                placeholder="the Forum Romanum, Rome"
                disabled={creating}
                className={inputCls}
              />
              <datalist id="roma-locations">
                {SUGGESTED_LOCATIONS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
          )}

          {/* SPECIAL attributes */}
          <div className="mt-8 w-full">
            <div className="flex items-center justify-between">
              <p className={labelCls}>Attributes · SPECIAL</p>
              {!devMode && (
                <span
                  className={`text-sm ${
                    remaining > 0 ? "text-[var(--color-gold)]" : "text-stone-500"
                  }`}
                >
                  {remaining} point{remaining === 1 ? "" : "s"} to spend
                </span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {ATTRIBUTE_KEYS.map((k) => {
                const meta = SPECIAL[k];
                const floor = devMode ? STAT_MIN : baseline[k];
                const canDec = stats[k] > floor;
                const canInc =
                  stats[k] < STAT_MAX && (devMode || remaining > 0);
                return (
                  <div
                    key={k}
                    className="flex items-center gap-3 rounded-md border border-stone-700 bg-stone-800/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[var(--color-gold)]">
                        {meta.roman}{" "}
                        <span className="text-xs uppercase tracking-wide text-stone-500">
                          {meta.english}
                        </span>
                      </div>
                      <div className="truncate text-xs text-stone-400">
                        {meta.blurb}
                      </div>
                    </div>
                    <button
                      onClick={() => adjust(k, -1)}
                      disabled={creating || !canDec}
                      aria-label={`Lower ${meta.roman}`}
                      className="h-8 w-8 rounded-md border border-stone-700 text-stone-300 transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-display text-lg text-parchment">
                      {stats[k]}
                    </span>
                    <button
                      onClick={() => adjust(k, 1)}
                      disabled={creating || !canInc}
                      aria-label={`Raise ${meta.roman}`}
                      className="h-8 w-8 rounded-md border border-stone-700 text-stone-300 transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Abilities */}
          <div className="mt-8 w-full">
            <p className={labelCls}>
              Special abilities{" "}
              <span className="lowercase tracking-normal text-stone-500">
                (choose up to {MAX_ABILITIES})
              </span>
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ABILITIES.map((ab) => {
                const selected = abilities.includes(ab.name);
                const atLimit = !selected && abilities.length >= MAX_ABILITIES;
                return (
                  <button
                    key={ab.name}
                    onClick={() => toggleAbility(ab.name)}
                    disabled={creating || atLimit}
                    className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? "border-[var(--color-gold)] bg-stone-800 ring-1 ring-[var(--color-gold)]"
                        : "border-stone-700 bg-stone-800/40 hover:border-stone-500"
                    }`}
                  >
                    <span className="block font-display text-[var(--color-gold)]">
                      {ab.name}
                    </span>
                    <span className="block text-sm text-stone-300">
                      {ab.description}
                    </span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-stone-400">
                      {formatEffects(ab.effects)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dev mode */}
          <div className="mt-8 w-full rounded-lg border border-stone-800 bg-stone-900/40 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                disabled={creating}
                className="accent-[var(--color-terracotta)]"
              />
              <span className="font-display uppercase tracking-widest text-stone-400">
                ⚙ Dev mode
              </span>
              <span className="text-stone-500">
                — set stats freely (1–{STAT_MAX}) and write a custom ability
              </span>
            </label>

            {devMode && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={customAbilityName}
                  onChange={(e) => setCustomAbilityName(e.target.value)}
                  maxLength={40}
                  placeholder="Custom ability name"
                  disabled={creating}
                  className={inputCls.replace("mt-2 ", "")}
                />
                <input
                  value={customAbilityDesc}
                  onChange={(e) => setCustomAbilityDesc(e.target.value)}
                  maxLength={200}
                  placeholder="What it does (narrative only)"
                  disabled={creating}
                  className={inputCls.replace("mt-2 ", "")}
                />
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="mt-6 w-full rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      <button
        onClick={handleStart}
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
