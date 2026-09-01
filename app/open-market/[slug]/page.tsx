import { notFound } from "next/navigation";
import {
  INTERIM_OPEN_MARKET_SLUGS,
  OPEN_MARKET_META_TABS,
  OPEN_MARKET_SPREADSHEET_ID,
  segmentBySlug,
} from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { loadTab } from "@/lib/loadTab";
import { SetupNotice } from "@/components/SetupNotice";
import { ScopeNotice } from "@/components/ScopeNotice";
import { DataTable } from "@/components/DataTable";

export const revalidate = 60;

const META_SLUGS: Record<string, { tab: string; title: string; description: string }> = {
  suchlaeufe: {
    tab: OPEN_MARKET_META_TABS.suchlaeufe,
    title: "Suchläufe-Protokoll",
    description: "Historie der stündlichen Open-Market-Läufe.",
  },
  "agent-state": {
    tab: OPEN_MARKET_META_TABS.agentState,
    title: "Agent State",
    description: "Rotationsstand für Discovery-Quellen, ATS und Regionen.",
  },
};

export default async function OpenMarketSegmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const segment = segmentBySlug(slug);
  const meta = META_SLUGS[slug];

  if (!segment && !meta) {
    notFound();
  }

  // Meta-Tabs (Suchläufe/Agent State) sind unabhängig vom gewählten Modus
  // immer sichtbar; nur echte Fachbereichs-Segmente werden gescoped.
  const prefs = meta ? null : await getPreferences();
  const inScope =
    meta !== undefined ||
    (prefs?.mode === "interim"
      ? INTERIM_OPEN_MARKET_SLUGS.includes(slug)
      : (prefs?.branches.includes(slug) ?? false));

  const tab = segment?.tab ?? meta!.tab;
  const title = segment?.label ?? meta!.title;
  const description = segment
    ? "Leads aus diesem Fachbereich, inkl. Live-Link-Audit-Status."
    : meta!.description;

  const result = inScope ? await loadTab(OPEN_MARKET_SPREADSHEET_ID, tab) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>

      {!inScope && (
        <ScopeNotice>
          Dieses Segment ist in deiner aktuellen Auswahl nicht sichtbar.
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
          filterColumns={
            segment
              ? ["Lead-Status", "Branche (Primär)", "Consultant Segment"]
              : []
          }
          badgeColumns={segment ? ["Lead-Status"] : []}
        />
      )}
    </div>
  );
}
