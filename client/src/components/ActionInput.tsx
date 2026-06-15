import { useState } from "react";

interface Props {
  disabled: boolean;
  onSubmit: (action: string) => void;
}

export default function ActionInput({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const action = value.trim();
    if (!action || disabled) return;
    onSubmit(action);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Or describe your own action…"
        className="flex-1 rounded-md border border-stone-700 bg-stone-800/70 px-4 py-3 text-parchment placeholder-stone-500 outline-none focus:border-[var(--color-gold)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-md bg-[var(--color-terracotta)] px-5 py-3 font-display uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Act
      </button>
    </form>
  );
}
