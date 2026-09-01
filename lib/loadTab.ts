import { getTabData } from "./googleSheets";
import { SheetsAccessError, SheetsNotConfiguredError, type SheetTable } from "./types";

export type TabResult =
  | { ok: true; table: SheetTable }
  | { ok: false; kind: "not-configured" }
  | { ok: false; kind: "access-error"; detail: string };

export async function loadTab(
  spreadsheetId: string,
  tab: string,
): Promise<TabResult> {
  try {
    const table = await getTabData(spreadsheetId, tab);
    return { ok: true, table };
  } catch (err) {
    if (err instanceof SheetsNotConfiguredError) {
      return { ok: false, kind: "not-configured" };
    }
    if (err instanceof SheetsAccessError) {
      return { ok: false, kind: "access-error", detail: err.message };
    }
    return {
      ok: false,
      kind: "access-error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
