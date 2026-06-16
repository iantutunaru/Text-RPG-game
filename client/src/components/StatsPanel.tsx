import type { Character, Item, World } from "@shared";
import { ATTRIBUTE_KEYS, SPECIAL } from "../../../shared/special";
import { armorOf, carryWeight, maxCarry } from "../../../shared/items";

interface Props {
  character: Character;
  world: World;
  items: Item[];
}

function Bar({
  value,
  max,
  tone = "vital",
}: {
  value: number;
  max: number;
  tone?: "vital" | "energy";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  // Vitals (HP) run green→amber→red with danger; energy is a calmer sky bar so
  // the two are easy to tell apart at a glance.
  const color =
    tone === "energy"
      ? "bg-sky-600"
      : pct > 50
        ? "bg-emerald-600"
        : pct > 25
          ? "bg-amber-600"
          : "bg-red-600";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-700">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: Character["status"] }) {
  const meta =
    status === "enslaved"
      ? { label: "Enslaved", cls: "border-red-800 text-red-300" }
      : status === "freedman"
        ? { label: "Libertus", cls: "border-amber-700 text-amber-300" }
        : { label: "Free", cls: "border-stone-600 text-stone-400" };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function Attr({
  label,
  value,
  title,
}: {
  label: string;
  value: number;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="rounded-md bg-stone-800/60 px-2 py-1.5 text-center"
    >
      <div className="text-xs uppercase tracking-wide text-stone-400">
        {label}
      </div>
      <div className="font-display text-lg text-parchment">{value}</div>
    </div>
  );
}

export default function StatsPanel({ character: c, world, items }: Props) {
  const identity = [c.age ? `Age ${c.age}` : null, c.ancestry]
    .filter(Boolean)
    .join(" · ");
  const cap = maxCarry(c.attributes.strength);

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
      {identity && <div className="mt-0.5 text-xs text-stone-500">{identity}</div>}
      <div className="mt-1.5">
        <StatusBadge status={c.status} />
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

      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-stone-300">Energy</span>
          <span className="text-stone-300">
            {c.energy}/{c.maxEnergy}
          </span>
        </div>
        <Bar value={c.energy} max={c.maxEnergy} tone="energy" />
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span className="text-stone-300">
          🪙 {c.gold} <span className="text-stone-500">sestertii</span>
        </span>
        <span className="text-stone-300">Rep {c.reputation}</span>
      </div>

      <div className="mt-1 flex justify-between text-sm text-stone-300">
        <span>🛡 Armor {armorOf(items)}</span>
        <span title="Carried weight / capacity (from Vires)">
          ⚖ {carryWeight(items)}/{cap}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {ATTRIBUTE_KEYS.map((k) => (
          <Attr
            key={k}
            label={SPECIAL[k].abbr}
            value={c.attributes[k]}
            title={`${SPECIAL[k].roman} (${SPECIAL[k].english}) — ${SPECIAL[k].blurb}`}
          />
        ))}
      </div>

      {c.abilities?.length > 0 && (
        <div className="mt-4 border-t border-stone-700 pt-3">
          <div className="text-xs uppercase tracking-wide text-stone-400">
            Traits
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {c.abilities.map((a) => (
              <span
                key={a.name}
                title={a.description}
                className="rounded bg-stone-800/60 px-2 py-0.5 text-xs text-stone-300"
              >
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-stone-700 pt-3 text-sm text-stone-300">
        <div className="text-stone-400">{world.location}</div>
        <div className="mt-1 capitalize text-stone-500">
          Day {world.day} · {world.timeOfDay}
        </div>
      </div>
    </div>
  );
}
