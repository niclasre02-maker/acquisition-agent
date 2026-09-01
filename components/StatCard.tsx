export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
