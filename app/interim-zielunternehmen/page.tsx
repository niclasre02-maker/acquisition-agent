import { INTERIM_SPREADSHEET_ID, INTERIM_TABS } from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { loadTab } from "@/lib/loadTab";
import { SetupNotice } from "@/components/SetupNotice";
import { ScopeNotice } from "@/components/ScopeNotice";
import { DataTable } from "@/components/DataTable";

export const revalidate = 60;

export default async function InterimZielunternehmenPage() {
  const prefs = await getPreferences();
  const inScope = prefs.mode === "interim";
  const result = inScope
    ? await loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.zielunternehmen)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Interim Zielunternehmen (Startliste)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Status des Erstscans der 423 Startlisten-Unternehmen und fällige
          Rechecks.
        </p>
      </div>

      {!inScope && (
        <ScopeNotice>
          Diese Ansicht ist nur im Modus &bdquo;Interim&ldquo; verfügbar. Du
          bist aktuell im Branchen-Modus unterwegs.
        </ScopeNotice>
      )}

      {inScope && result && !result.ok && (
        <SetupNotice
          kind={result.kind}
          detail={result.kind === "access-error" ? result.detail : undefined}
        />
      )}

      {inScope && result && result.ok && (
        <DataTable
          headers={result.table.headers}
          rows={result.table.rows}
          filterColumns={["Prüfstatus"]}
          badgeColumns={["Prüfstatus"]}
        />
      )}
    </div>
  );
}
