interface Props {
  choices: string[];
  disabled: boolean;
  onChoose: (choice: string) => void;
}

export default function ChoiceButtons({ choices, disabled, onChoose }: Props) {
  if (choices.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {choices.map((c, i) => (
        <button
          key={i}
          onClick={() => onChoose(c)}
          disabled={disabled}
          className="rounded-md border border-stone-600 bg-stone-800/70 px-4 py-3 text-left text-parchment transition hover:border-[var(--color-gold)] hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {c}
        </button>
      ))}
    </div>
  );
}
