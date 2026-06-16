import { useEffect } from "react";
import type { Character, EquipIntent, Item } from "@shared";
import {
  ATTRIBUTE_KEYS,
  SPECIAL,
  effectsOf,
  formatEffects,
} from "../../../shared/special";
import {
  EQUIP_SLOTS,
  SLOT_LABEL,
  armorOf,
  carryWeight,
  effectiveAttributes,
  equippedInSlot,
  isEquippable,
  maxCarry,
  resolveItem,
  weaponDamageOf,
} from "../../../shared/items";

interface Props {
  open: boolean;
  character: Character;
  items: Item[];
  busy: boolean;
  ended: boolean;
  onAction: (action: string, intent?: EquipIntent) => void;
  onClose: () => void;
}

// ---- Small presentational helpers (parchment-themed) ----

function Bar({ pct, className }: { pct: number; className: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/15">
      <div className={`h-full ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-ink)]/15 pt-4">
      <h3 className="mb-2 font-display text-sm uppercase tracking-[0.2em] text-[var(--color-ink)]/70">
        {title}
      </h3>
      {children}
    </section>
  );
}

const sheetBtn =
  "rounded border border-[var(--color-ink)]/40 px-2.5 py-1 text-xs font-display uppercase tracking-wide text-[var(--color-ink)] transition hover:bg-[var(--color-ink)]/10 disabled:cursor-not-allowed disabled:opacity-40";

export default function CharacterSheet({
  open,
  character: c,
  items,
  busy,
  ended,
  onAction,
  onClose,
}: Props) {
  // Close on Escape (mirrors MapOverlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const eff = effectiveAttributes(c.attributes, items);
  const armor = armorOf(items);
  const weaponDmg = weaponDamageOf(items);
  const load = carryWeight(items);
  const cap = maxCarry(c.attributes.strength);
  const xpNext = c.level * 100;
  const hpPct = (c.hp / c.maxHp) * 100;
  const hpColor =
    hpPct > 50 ? "bg-emerald-600" : hpPct > 25 ? "bg-amber-600" : "bg-red-700";
  const energyPct = (c.energy / c.maxEnergy) * 100;
  const statusLabel =
    c.status === "enslaved"
      ? "Enslaved"
      : c.status === "freedman"
        ? "Libertus"
        : "Free";
  const statusCls =
    c.status === "enslaved"
      ? "border-red-700/60 text-red-800"
      : c.status === "freedman"
        ? "border-amber-700/60 text-amber-800"
        : "border-[var(--color-ink)]/30 text-[var(--color-ink)]/60";
  const carryColor =
    load > cap * 0.9 ? "bg-[var(--color-terracotta)]" : "bg-[var(--color-ink)]/50";

  const identity = [c.age ? `Age ${c.age}` : null, c.ancestry]
    .filter(Boolean)
    .join(" · ");

  const carried = items.filter((i) => !i.equipped);

  const equip = (name: string) => {
    onAction(`Equip the ${name}.`, { type: "equip", item: name });
    onClose();
  };
  const unequip = (name: string) => {
    onAction(`Stow the ${name}.`, { type: "unequip", item: name });
    onClose();
  };
  const equipDisabled = busy || ended;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Character sheet"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border-2 border-[var(--color-ink)]/40 bg-[var(--color-parchment)] text-[var(--color-ink)] shadow-2xl ring-1 ring-inset ring-[var(--color-ink)]/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-ink)]/20 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide">{c.name}</h2>
            <div className="text-sm capitalize text-[var(--color-ink)]/70">
              {c.archetype} · Level {c.level}
              {identity && (
                <span className="normal-case"> — {identity}</span>
              )}
            </div>
            <span
              className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusCls}`}
            >
              {statusLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--color-ink)]/40 px-3 py-1.5 text-sm transition hover:bg-[var(--color-ink)]/10"
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Vitals */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="flex justify-between text-sm">
                <span>Health</span>
                <span>
                  {c.hp}/{c.maxHp}
                </span>
              </div>
              <Bar pct={hpPct} className={hpColor} />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>Energy</span>
                <span>
                  {c.energy}/{c.maxEnergy}
                </span>
              </div>
              <Bar pct={energyPct} className="bg-sky-600" />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>Experience</span>
                <span>
                  {c.xp}/{xpNext}
                </span>
              </div>
              <Bar pct={(c.xp / xpNext) * 100} className="bg-[var(--color-gold)]" />
            </div>
            <div className="text-sm">
              🪙 {c.gold} <span className="text-[var(--color-ink)]/60">sestertii</span>
            </div>
            <div className="text-sm">
              Reputation <span className="font-display">{c.reputation}</span>
            </div>
          </div>

          {/* Combat */}
          <Section title="Combat">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded border border-[var(--color-ink)]/20 py-2">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink)]/60">
                  🛡 Armor
                </div>
                <div className="font-display text-xl">{armor}</div>
              </div>
              <div className="rounded border border-[var(--color-ink)]/20 py-2">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink)]/60">
                  ⚔ Weapon
                </div>
                <div className="font-display text-xl">{weaponDmg}</div>
              </div>
              <div className="rounded border border-[var(--color-ink)]/20 py-2">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink)]/60">
                  ⚖ Carry
                </div>
                <div className="font-display text-xl">
                  {load}/{cap}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <Bar pct={(load / cap) * 100} className={carryColor} />
            </div>
          </Section>

          {/* Narrative identity */}
          <Section title="Of this person it is said">
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                <span className="font-display uppercase tracking-wide text-[var(--color-ink)]/60">
                  Appearance.{" "}
                </span>
                {c.appearance?.trim() || (
                  <span className="italic text-[var(--color-ink)]/50">
                    Unrecorded.
                  </span>
                )}
              </p>
              <p>
                <span className="font-display uppercase tracking-wide text-[var(--color-ink)]/60">
                  Background.{" "}
                </span>
                {c.background?.trim() || (
                  <span className="italic text-[var(--color-ink)]/50">
                    Unrecorded.
                  </span>
                )}
              </p>
            </div>
          </Section>

          {/* Attributes */}
          <Section title="Attributes (SPECIAL)">
            <ul className="space-y-1.5 text-sm">
              {ATTRIBUTE_KEYS.map((k) => {
                const delta = eff[k] - c.attributes[k];
                return (
                  <li key={k} className="flex items-baseline gap-2">
                    <span className="w-40 shrink-0 font-display">
                      {SPECIAL[k].roman}{" "}
                      <span className="text-[var(--color-ink)]/50">
                        ({SPECIAL[k].english})
                      </span>
                    </span>
                    <span className="w-16 shrink-0 tabular-nums">
                      <span className="font-display text-base">{eff[k]}</span>
                      {delta !== 0 && (
                        <span
                          className={
                            delta > 0 ? "text-emerald-700" : "text-red-700"
                          }
                        >
                          {" "}
                          ({delta > 0 ? "+" : "−"}
                          {Math.abs(delta)})
                        </span>
                      )}
                    </span>
                    <span className="text-[var(--color-ink)]/60">
                      {SPECIAL[k].blurb}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs italic text-[var(--color-ink)]/50">
              Vigor underpins your maximum health; values shown include equipped
              gear. Each level grants +5 max HP.
            </p>
          </Section>

          {/* Abilities */}
          {c.abilities?.length > 0 && (
            <Section title="Traits">
              <ul className="space-y-2 text-sm">
                {c.abilities.map((a) => {
                  const fx = formatEffects(effectsOf(a.name));
                  return (
                    <li key={a.name}>
                      <span className="font-display">{a.name}</span>
                      {fx && (
                        <span className="text-[var(--color-ink)]/60"> — {fx}</span>
                      )}
                      <div className="text-[var(--color-ink)]/70">
                        {a.description}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* Equipment */}
          <Section title="Equipment">
            <ul className="space-y-1.5 text-sm">
              {EQUIP_SLOTS.map((slot) => {
                const item = equippedInSlot(items, slot);
                return (
                  <li key={slot} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-[var(--color-ink)]/60">
                      {SLOT_LABEL[slot]}
                    </span>
                    {item ? (
                      <>
                        <span className="flex-1 font-display">{item.name}</span>
                        <button
                          className={sheetBtn}
                          disabled={equipDisabled}
                          onClick={() => unequip(item.name)}
                        >
                          Stow
                        </button>
                      </>
                    ) : (
                      <span className="flex-1 italic text-[var(--color-ink)]/40">
                        empty
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Carried inventory */}
          <Section title="Carried">
            {carried.length === 0 ? (
              <p className="text-sm italic text-[var(--color-ink)]/50">
                You carry nothing else.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {carried.map((it, i) => {
                  const r = resolveItem(it.name);
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className="flex-1">
                        {it.name}
                        {it.qty > 1 && (
                          <span className="text-[var(--color-ink)]/50">
                            {" "}
                            ×{it.qty}
                          </span>
                        )}
                        <span className="text-xs text-[var(--color-ink)]/40">
                          {" "}
                          · {r.weight} wt
                        </span>
                      </span>
                      {isEquippable(it.name) && (
                        <button
                          className={sheetBtn}
                          disabled={equipDisabled}
                          onClick={() => equip(it.name)}
                        >
                          Equip
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {equipDisabled && (
              <p className="mt-2 text-xs italic text-[var(--color-ink)]/50">
                {ended
                  ? "Your tale has ended."
                  : "Equipping takes a turn — finish the current one first."}
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
