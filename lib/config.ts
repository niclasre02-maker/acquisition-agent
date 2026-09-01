export const INTERIM_SPREADSHEET_ID =
  process.env.INTERIM_SPREADSHEET_ID ??
  "1RJNkH_WOMxDJwbWj5LP_nxCutUfpkXkI_nryglzrpT0";

export const OPEN_MARKET_SPREADSHEET_ID =
  process.env.OPEN_MARKET_SPREADSHEET_ID ??
  "10n-vWPuJMUv-TkmjjxupiBKoIgrobfDED1xKWQC0DsA";

export const INTERIM_TABS = {
  agentState: "Agent State",
  // Im Regelwerk-Text noch "Interim Zielunternehmen" genannt, im echten
  // Sheet aber tatsächlich so umbenannt (per Live-Check verifiziert).
  zielunternehmen: "Zielkunden Fortschritt",
  regelwerk: "Interim Demand Regelwerk",
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

/** Open-Market-Segmente, die inhaltlich zu "Interim" gehören. */
export const INTERIM_OPEN_MARKET_SLUGS = ["interim-b2b", "befristet-interim"];

/** Die übrigen, frei wählbaren Branchen-Segmente (Nicht-Interim). */
export const BRANCH_SEGMENT_SLUGS = OPEN_MARKET_SEGMENTS.map((s) => s.slug).filter(
  (slug) => !INTERIM_OPEN_MARKET_SLUGS.includes(slug),
);

export const INTERIM_OPEN_MARKET_SEGMENTS = OPEN_MARKET_SEGMENTS.filter((s) =>
  INTERIM_OPEN_MARKET_SLUGS.includes(s.slug),
);

export const BRANCH_SEGMENTS = OPEN_MARKET_SEGMENTS.filter((s) =>
  BRANCH_SEGMENT_SLUGS.includes(s.slug),
);
