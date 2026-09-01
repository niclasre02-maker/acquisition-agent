const COLOR_RULES: { match: RegExp; className: string }[] = [
  { match: /^top$/i, className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  {
    match: /^strong$/i,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    match: /watchlist/i,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    match: /ausgeschlossen/i,
    className: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
  {
    match: /^(neu|offen)$/i,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    match: /geprüft/i,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    match: /erneuter impuls/i,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    match: /geschlossen/i,
    className: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
  {
    match: /technisch unvollständig/i,
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  },
];

const DEFAULT_CLASS =
  "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

export function Badge({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed) return <span className="text-neutral-400">–</span>;
  const rule = COLOR_RULES.find((r) => r.match.test(trimmed));
  const className = rule?.className ?? DEFAULT_CLASS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {trimmed}
    </span>
  );
}
