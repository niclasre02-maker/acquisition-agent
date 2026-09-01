import Link from "next/link";
import {
  BRANCH_SEGMENTS,
  INTERIM_OPEN_MARKET_SEGMENTS,
  INTERIM_SPREADSHEET_ID,
  INTERIM_TABS,
  OPEN_MARKET_META_TABS,
  OPEN_MARKET_SPREADSHEET_ID,
  type OpenMarketSegment,
} from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { loadTab } from "@/lib/loadTab";
import { countByField, getField } from "@/lib/fields";
import { StatCard } from "@/components/StatCard";
import { SetupNotice } from "@/components/SetupNotice";

export const revalidate = 60;

export default async function OverviewPage() {
  const prefs = await getPreferences();
  const isInterim = prefs.mode === "interim";
  const segments = isInterim
    ? INTERIM_OPEN_MARKET_SEGMENTS
    : BRANCH_SEGMENTS.filter((seg) => prefs.branches.includes(seg.slug));

  let radarResult: Awaited<ReturnType<typeof loadTab>> | null = null;
  let zielResult: Awaited<ReturnType<typeof loadTab>> | null = null;
  let agentStateResult: Awaited<ReturnType<typeof loadTab>> | null = null;
  if (isInterim) {
    [radarResult, zielResult, agentStateResult] = await Promise.all([
      loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.radar),
      loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.zielunternehmen),
      loadTab(INTERIM_SPREADSHEET_ID, INTERIM_TABS.agentState),
    ]);
  }

  const [suchlaeufeResult, ...segmentResults] = await Promise.all([
    loadTab(OPEN_MARKET_SPREADSHEET_ID, OPEN_MARKET_META_TABS.suchlaeufe),
    ...segments.map((seg) => loadTab(OPEN_MARKET_SPREADSHEET_ID, seg.tab)),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Übersicht
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isInterim
            ? "Live-Stand aus dem Interim Demand Radar und den Interim-Leads des Open Market Radar."
            : "Live-Stand aus deinen gewählten Fachbereichen im Open Market Radar."}
        </p>
      </section>

      {isInterim && (
        <section>
          <SectionHeader
            title="Interim Demand Radar"
            href="/interim-radar"
            linkLabel="Alle Chancen ansehen"
          />
          {radarResult?.ok ? (
            <RadarStats records={radarResult.table.records} />
          ) : (
            radarResult && (
              <SetupNotice
                kind={radarResult.kind}
                detail={radarResult.kind === "access-error" ? radarResult.detail : undefined}
              />
            )
          )}
          {zielResult?.ok && (
            <p className="mt-3 text-sm text-neutral-500">
              Startliste:{" "}
              <StatusInline records={zielResult.table.records} field="Prüfstatus" /> ·{" "}
              <Link href="/interim-zielunternehmen" className="underline">
                zur Startlisten-Ansicht
              </Link>
            </p>
          )}
          {agentStateResult?.ok && (
            <AgentStateCards records={agentStateResult.table.records} />
          )}
        </section>
      )}

      <section>
        <SectionHeader
          title="Open Market Akquise Radar"
          href="/open-market"
          linkLabel="Alle Segmente ansehen"
        />
        {segments.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Du hast noch keine Fachbereiche ausgewählt.{" "}
            <Link href="/einstellungen" className="underline">
              Jetzt auswählen →
            </Link>
          </p>
        ) : (
          <OpenMarketStats segments={segments} segmentResults={segmentResults} />
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          Letzter Suchlauf
        </h2>
        {suchlaeufeResult.ok ? (
          <LatestRun table={suchlaeufeResult.table} />
        ) : (
          <SetupNotice
            kind={suchlaeufeResult.kind}
            detail={
              suchlaeufeResult.kind === "access-error"
                ? suchlaeufeResult.detail
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
      </h2>
      <Link href={href} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        {linkLabel} →
      </Link>
    </div>
  );
}

function RadarStats({ records }: { records: Record<string, string>[] }) {
  const counts = countByField(records, ["Priorität", "Prioritaet"]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="TOP" value={counts.get("TOP") ?? 0} />
      <StatCard label="STRONG" value={counts.get("STRONG") ?? 0} />
      <StatCard label="Watchlist" value={counts.get("WATCHLIST") ?? 0} />
      <StatCard label="Signale gesamt" value={records.length} />
    </div>
  );
}

function StatusInline({
  records,
  field,
}: {
  records: Record<string, string>[];
  field: string;
}) {
  const counts = countByField(records, [field]);
  const parts = Array.from(counts.entries()).map(
    ([status, n]) => `${status}: ${n}`,
  );
  return <>{parts.join(" · ") || "keine Daten"}</>;
}

function AgentStateCards({ records }: { records: Record<string, string>[] }) {
  if (records.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {records.map((r, i) => {
        const agent = getField(r, "Agent");
        const status = getField(r, "Status");
        const geprueft = getField(r, "Geprüft gesamt");
        const offen = getField(r, "Noch offen");
        const naechstes = getField(r, "Nächstes Unternehmen");
        const letzterLauf = getField(r, "Letzter Lauf");
        return (
          <div
            key={i}
            className="rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="font-medium text-neutral-900 dark:text-neutral-50">
              {agent || "Agent"}{" "}
              <span className="ml-2 font-normal text-neutral-400">{letzterLauf}</span>
            </p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {geprueft && `${geprueft} geprüft`}
              {offen && ` · ${offen} offen`}
              {naechstes && ` · als Nächstes: ${naechstes}`}
            </p>
            {status && (
              <p className="mt-1 text-neutral-500 dark:text-neutral-500">{status}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OpenMarketStats({
  segments,
  segmentResults,
}: {
  segments: OpenMarketSegment[];
  segmentResults: Awaited<ReturnType<typeof loadTab>>[];
}) {
  const ok = segmentResults.filter((r) => r.ok) as Extract<
    Awaited<ReturnType<typeof loadTab>>,
    { ok: true }
  >[];

  if (ok.length === 0) {
    const first = segmentResults[0];
    return (
      <SetupNotice
        kind={first.ok ? "access-error" : first.kind}
        detail={!first.ok && first.kind === "access-error" ? first.detail : undefined}
      />
    );
  }

  const allRecords = ok.flatMap((r) => r.table.records);
  const counts = countByField(allRecords, ["Lead-Status"]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Neu" value={counts.get("Neu") ?? 0} />
        <StatCard label="Erneuter Impuls" value={counts.get("Erneuter Impuls") ?? 0} />
        <StatCard label="Geschlossen" value={counts.get("Geschlossen") ?? 0} />
        <StatCard label="Leads gesamt" value={allRecords.length} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-400">
                Segment
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-400">
                Leads
              </th>
              <th className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-400">
                Neu
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {segments.map((seg, i) => {
              const result = segmentResults[i];
              const records = result.ok ? result.table.records : [];
              const neu = countByField(records, ["Lead-Status"]).get("Neu") ?? 0;
              return (
                <tr key={seg.slug}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/open-market/${seg.slug}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {seg.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{records.length}</td>
                  <td className="px-3 py-2">{neu}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LatestRun({ table }: { table: { records: Record<string, string>[] } }) {
  const last = table.records[table.records.length - 1];
  if (!last) {
    return <p className="text-sm text-neutral-500">Noch keine Suchläufe protokolliert.</p>;
  }
  const laufId = getField(last, "Lauf-ID");
  const start = getField(last, "Start");
  const ende = getField(last, "Ende");
  const bemerkung = getField(last, "Bemerkung");
  const neu = getField(last, "Neue Leads");
  const impulse = getField(last, "Erneute Impulse");
  const geschlossen = getField(last, "Geschlossen");
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p>
        <span className="font-medium">{laufId || "Lauf"}</span> · {start || "–"} – {ende || "–"}
      </p>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        {neu || "0"} neue Leads · {impulse || "0"} erneute Impulse · {geschlossen || "0"} geschlossen
      </p>
      {bemerkung && <p className="mt-2 text-neutral-600 dark:text-neutral-400">{bemerkung}</p>}
    </div>
  );
}
