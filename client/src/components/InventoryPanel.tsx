import type { Item } from "@shared";

export default function InventoryPanel({ items }: { items: Item[] }) {
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-4">
      <h3 className="font-display text-sm uppercase tracking-widest text-stone-400">
        Inventory
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm italic text-stone-500">
          You carry nothing.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-sm">
              <span className="text-parchment">{it.name}</span>
              {it.qty > 1 && (
                <span className="text-stone-400"> ×{it.qty}</span>
              )}
              {it.description && (
                <span className="block text-xs text-stone-500">
                  {it.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
