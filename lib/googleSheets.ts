import { google } from "googleapis";
import { SheetsAccessError, SheetsNotConfiguredError, type SheetTable } from "./types";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

type JwtClient = InstanceType<typeof google.auth.JWT>;

let cachedClient: JwtClient | null = null;

function getServiceAccountCredentials(): { email: string; key: string } | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  // Env vars typically store the PEM key with literal "\n" sequences.
  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return { email, key };
}

export function isSheetsConfigured(): boolean {
  return getServiceAccountCredentials() !== null;
}

function getAuthClient(): JwtClient {
  if (cachedClient) return cachedClient;
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new SheetsNotConfiguredError(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL und/oder GOOGLE_PRIVATE_KEY sind nicht gesetzt.",
    );
  }
  cachedClient = new google.auth.JWT({
    email: creds.email,
    key: creds.key,
    scopes: SCOPES,
  });
  return cachedClient;
}

type CacheEntry = { table: SheetTable; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function normalizeRows(values: string[][] | undefined): SheetTable {
  if (!values || values.length === 0) {
    return { headers: [], rows: [], records: [] };
  }
  const [headerRow, ...dataRows] = values;
  const headers = headerRow.map((h) => (h ?? "").toString().trim());
  const rows = dataRows
    .filter((r) => r.some((cell) => (cell ?? "").toString().trim() !== ""))
    .map((r) => headers.map((_, i) => (r[i] ?? "").toString()));
  const records = rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
  );
  return { headers, rows, records };
}

/**
 * Fetches a full tab from a Google Sheet as headers + rows.
 * Throws SheetsNotConfiguredError if no credentials are set, or
 * SheetsAccessError if the API call fails (missing share, wrong tab name, etc.).
 */
export async function getTabData(
  spreadsheetId: string,
  tab: string,
): Promise<SheetTable> {
  const cacheKey = `${spreadsheetId}::${tab}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.table;
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  let values: string[][] | undefined;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!A1:AZ5000`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    values = res.data.values as string[][] | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SheetsAccessError(
      `Konnte Tab "${tab}" nicht laden: ${message}`,
      spreadsheetId,
      tab,
    );
  }

  const table = normalizeRows(values);
  cache.set(cacheKey, { table, expiresAt: Date.now() + CACHE_TTL_MS });
  return table;
}

export function clearSheetsCache(): void {
  cache.clear();
}
