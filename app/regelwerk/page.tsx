import {
  INTERIM_SPREADSHEET_ID,
  INTERIM_TABS,
  OPEN_MARKET_META_TABS,
  OPEN_MARKET_SPREADSHEET_ID,
} from "@/lib/config";
import { loadTab } from "@/lib/loadTab";
import { SetupNotice } from "@/components/SetupNotice";
import { DataTable } from "@/components/DataTable";

export const revalidate = 60;

export default async function RegelwerkPage() {
  const [interimResult, openMarketResult] = await Promise.all([
    loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.regelwerk),
    loadTab(OPEN_MARKET_SPREADSHEET_ID, OPEN_MARKET_META_TABS.regelwerk),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Regelwerk
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Oberste fachliche und prozessuale Instanz für beide Radare – hier
          gepflegte Regeln überschreiben abweichende Annahmen andernorts.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          Interim Demand Regelwerk
        </h2>
        {interimResult.ok ? (
          <DataTable
            headers={interimResult.table.headers}
            rows={interimResult.table.rows}
          />
        ) : (
          <SetupNotice
            kind={interimResult.kind}
            detail={interimResult.kind === "access-error" ? interimResult.detail : undefined}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          Open Market Regelwerk (13 Regelwerk)
        </h2>
        {openMarketResult.ok ? (
          <DataTable
            headers={openMarketResult.table.headers}
            rows={openMarketResult.table.rows}
          />
        ) : (
          <SetupNotice
            kind={openMarketResult.kind}
            detail={
              openMarketResult.kind === "access-error"
                ? openMarketResult.detail
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
