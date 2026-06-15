import type { Character, World } from "@shared";

interface Props {
  character: Character;
  world: World;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    pct > 50 ? "bg-emerald-600" : pct > 25 ? "bg-amber-600" : "bg-red-600";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-700">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Attr({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-stone-800/60 px-2 py-1.5 text-center">
      <div className="text-xs uppercase tracking-wide text-stone-400">
        {label}
      </div>
      <div className="font-display text-lg text-parchment">{value}</div>
    </div>
  );
}

export default function StatsPanel({ character: c, world }: Props) {
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl text-[var(--color-gold)]">
          {c.name}
        </h2>
        <span className="text-sm capitalize text-stone-400">
          {c.archetype} · Lvl {c.level}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-stone-300">Health</span>
          <span className="text-stone-300">
            {c.hp}/{c.maxHp}
          </span>
        </div>
        <Bar value={c.hp} max={c.maxHp} />
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span className="text-stone-300">
          🪙 {c.gold} <span className="text-stone-500">sestertii</span>
        </span>
        <span className="text-stone-300">Rep {c.reputation}</span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Attr label="Might" value={c.attributes.might} />
        <Attr label="Agi" value={c.attributes.agility} />
        <Attr label="Wits" value={c.attributes.wits} />
        <Attr label="Charm" value={c.attributes.charm} />
      </div>

      <div className="mt-4 border-t border-stone-700 pt-3 text-sm text-stone-300">
        <div className="text-stone-400">{world.location}</div>
        <div className="mt-1 capitalize text-stone-500">
          Day {world.day} · {world.timeOfDay}
        </div>
      </div>
    </div>
  );
}
