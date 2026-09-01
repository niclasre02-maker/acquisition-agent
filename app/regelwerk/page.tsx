import {
  INTERIM_SPREADSHEET_ID,
  INTERIM_TABS,
  OPEN_MARKET_META_TABS,
  OPEN_MARKET_SPREADSHEET_ID,
} from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { loadTab } from "@/lib/loadTab";
import { SetupNotice } from "@/components/SetupNotice";
import { DataTable } from "@/components/DataTable";

export const revalidate = 60;

export default async function RegelwerkPage() {
  const prefs = await getPreferences();
  const isInterim = prefs.mode === "interim";

  const result = isInterim
    ? await loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.regelwerk)
    : await loadTab(OPEN_MARKET_SPREADSHEET_ID, OPEN_MARKET_META_TABS.regelwerk);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Regelwerk
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Oberste fachliche und prozessuale Instanz für{" "}
          {isInterim ? "den Interim Demand Radar" : "den Open Market Akquise Radar"}{" "}
          – hier gepflegte Regeln überschreiben abweichende Annahmen andernorts.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {isInterim ? "Interim Demand Regelwerk" : "Open Market Regelwerk (13 Regelwerk)"}
        </h2>
        {result.ok ? (
          <DataTable headers={result.table.headers} rows={result.table.rows} />
        ) : (
          <SetupNotice
            kind={result.kind}
            detail={result.kind === "access-error" ? result.detail : undefined}
          />
        )}
      </section>
    </div>
  );
}
