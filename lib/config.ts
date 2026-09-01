export const INTERIM_SPREADSHEET_ID =
  process.env.INTERIM_SPREADSHEET_ID ??
  "1RJNkH_WOMxDJwbWj5LP_nxCutUfpkXkI_nryglzrpT0";

export const OPEN_MARKET_SPREADSHEET_ID =
  process.env.OPEN_MARKET_SPREADSHEET_ID ??
  "10n-vWPuJMUv-TkmjjxupiBKoIgrobfDED1xKWQC0DsA";

export const INTERIM_TABS = {
  regelwerk: "Interim Demand Regelwerk",
  zielunternehmen: "Interim Zielunternehmen",
  radar: "Interim Demand Radar",
} as const;

export type OpenMarketSegment = {
  slug: string;
  tab: string;
  label: string;
};

export const OPEN_MARKET_SEGMENTS: OpenMarketSegment[] = [
  { slug: "interim-b2b", tab: "01 Interim B2B", label: "Interim B2B (bestätigt)" },
  {
    slug: "befristet-interim",
    tab: "02 Befristet Interim",
    label: "Befristet – mögliches Interim-Potenzial",
  },
  { slug: "finance", tab: "03 Finance", label: "Finance" },
  { slug: "financial-services", tab: "04 Financial Services", label: "Financial Services" },
  { slug: "life-sciences", tab: "05 Life Sciences", label: "Life Sciences" },
  { slug: "it-digital", tab: "06 IT & Digital", label: "IT & Digital" },
  { slug: "marketing", tab: "07 Marketing", label: "Marketing" },
  { slug: "sales", tab: "08 Sales", label: "Sales" },
  { slug: "konsumgueter", tab: "09 Konsumgüter", label: "Konsumgüter" },
  { slug: "hr-people", tab: "10 HR & People", label: "HR & People" },
];

export const OPEN_MARKET_META_TABS = {
  regelwerk: "13 Regelwerk",
  agentState: "12 Agent State",
  suchlaeufe: "11 Suchläufe",
} as const;

export function segmentBySlug(slug: string): OpenMarketSegment | undefined {
  return OPEN_MARKET_SEGMENTS.find((s) => s.slug === slug);
}
