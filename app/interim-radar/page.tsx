import { INTERIM_SPREADSHEET_ID, INTERIM_TABS } from "@/lib/config";
import { loadTab } from "@/lib/loadTab";
import { SetupNotice } from "@/components/SetupNotice";
import { DataTable } from "@/components/DataTable";

export const revalidate = 60;

export default async function InterimRadarPage() {
  const result = await loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.radar);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Interim Demand Radar
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Konkrete Interim-Chancen aus Startliste und freier DACH-Suche.
        </p>
      </div>
      {result.ok ? (
        <DataTable
          headers={result.table.headers}
          rows={result.table.rows}
          filterColumns={[
            "Priorität",
            "Account-Typ",
            "Trigger-Kategorie",
            "Branche",
            "Status",
          ]}
          badgeColumns={["Priorität", "Status", "Portal-/Procurement-Risiko"]}
        />
      ) : (
        <SetupNotice
          kind={result.kind}
          detail={result.kind === "access-error" ? result.detail : undefined}
        />
      )}
    </div>
  );
}
