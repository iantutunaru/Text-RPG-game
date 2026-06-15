import type { LocalTheme, MapState } from "@shared";
import { getAnchor } from "../../../shared/mapData";

interface Props {
  map?: MapState;
}

// A short glyph legend per theme (kept tiny so the panel stays compact).
const LEGENDS: Record<LocalTheme, [string, string][]> = {
  slum: [
    ["#", "insula"],
    [".", "alley"],
    ["%", "refuse"],
  ],
  forum: [
    ["I", "column"],
    ["#", "temple"],
    ["=", "steps"],
  ],
  temple: [
    ["I", "column"],
    ["#", "cella"],
  ],
  ludus: [
    ["#", "wall"],
    ["I", "post"],
    ["=", "racks"],
  ],
  arena: [
    ["O", "tiers"],
    [".", "sand"],
    ["#", "stands"],
  ],
  harbor: [
    ["~", "water"],
    ["=", "pier"],
    ["#", "ship"],
  ],
  castrum: [
    ["#", "rampart"],
    ["A", "tent"],
    ["=", "via"],
  ],
  wilderness: [
    ["^", "woods"],
    ["~", "river"],
    ["=", "road"],
  ],
  villa: [
    ["#", "wall"],
    ["~", "pool"],
    ["I", "column"],
  ],
  market: [
    ["#", "stall"],
    [":", "wares"],
  ],
  generic: [
    ["#", "building"],
    ["=", "path"],
  ],
};

const THEME_LABEL: Record<LocalTheme, string> = {
  slum: "Backstreets",
  forum: "Civic plaza",
  temple: "Sanctuary",
  ludus: "Training yard",
  arena: "Amphitheatre",
  harbor: "Waterfront",
  castrum: "Fortified camp",
  wilderness: "Open country",
  villa: "Estate grounds",
  market: "Marketplace",
  generic: "Surroundings",
};

export default function LocalMap({ map }: Props) {
  if (!map || map.chunks.length === 0) {
    return (
      <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-4">
        <h3 className="font-display text-sm uppercase tracking-widest text-stone-400">
          Local Map
        </h3>
        <p className="mt-2 text-sm italic text-stone-500">
          The ground has not yet taken shape…
        </p>
      </div>
    );
  }

  const chunk =
    map.chunks.find((c) => c.cx === map.pos.cx && c.cy === map.pos.cy) ??
    map.chunks[map.chunks.length - 1];
  const anchor = getAnchor(map.anchorId);
  const place = anchor?.label ?? THEME_LABEL[map.theme];

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm uppercase tracking-widest text-stone-400">
          Local Map
        </h3>
        <span className="text-xs text-stone-500">{THEME_LABEL[map.theme]}</span>
      </div>

      <div className="mt-1 truncate text-xs text-[var(--color-gold)]">{place}</div>

      <pre
        className="mt-2 overflow-x-auto font-mono text-[10px] leading-[1.05] tracking-tight text-stone-400"
        aria-label="Local ASCII map"
      >
        {chunk.rows.map((row, y) => {
          if (y === map.pos.y) {
            const before = row.slice(0, map.pos.x);
            const after = row.slice(map.pos.x + 1);
            return (
              <span key={y}>
                {before}
                <span className="font-bold text-[var(--color-gold)]">@</span>
                {after}
                {"\n"}
              </span>
            );
          }
          return <span key={y}>{row + "\n"}</span>;
        })}
      </pre>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-500">
        <span>
          <span className="font-bold text-[var(--color-gold)]">@</span> you
        </span>
        {LEGENDS[map.theme].map(([glyph, meaning]) => (
          <span key={glyph}>
            <span className="text-stone-300">{glyph}</span> {meaning}
          </span>
        ))}
      </div>
    </div>
  );
}
