import Link from "next/link";

export function ScopeNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-xl rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      <p>{children}</p>
      <Link
        href="/einstellungen"
        className="mt-3 inline-block text-blue-600 hover:underline dark:text-blue-400"
      >
        Auswahl ändern →
      </Link>
    </div>
  );
}
