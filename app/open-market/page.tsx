import Link from "next/link";
import { OPEN_MARKET_SEGMENTS, OPEN_MARKET_SPREADSHEET_ID } from "@/lib/config";
import { loadTab } from "@/lib/loadTab";
import { countByField } from "@/lib/fields";

export const revalidate = 60;

export default async function OpenMarketIndexPage() {
  const results = await Promise.all(
    OPEN_MARKET_SEGMENTS.map((seg) => loadTab(OPEN_MARKET_SPREADSHEET_ID, seg.tab)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Open Market Akquise Radar
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Freie DACH-Akquise-Leads über 10 Fachbereiche.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OPEN_MARKET_SEGMENTS.map((seg, i) => {
          const result = results[i];
          const records = result.ok ? result.table.records : [];
          const counts = countByField(records, ["Lead-Status"]);
          return (
            <Link
              key={seg.slug}
              href={`/open-market/${seg.slug}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <h2 className="font-medium text-neutral-900 dark:text-neutral-50">
                {seg.label}
              </h2>
              {result.ok ? (
                <p className="mt-2 text-sm text-neutral-500">
                  {records.length} Leads · {counts.get("Neu") ?? 0} neu ·{" "}
                  {counts.get("Erneuter Impuls") ?? 0} erneuter Impuls
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  Nicht abrufbar
                </p>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex gap-4 text-sm">
        <Link href="/open-market/suchlaeufe" className="text-blue-600 hover:underline dark:text-blue-400">
          Suchläufe-Protokoll →
        </Link>
        <Link href="/open-market/agent-state" className="text-blue-600 hover:underline dark:text-blue-400">
          Agent State →
        </Link>
      </div>
    </div>
  );
}
