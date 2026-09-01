export type SheetTable = {
  /** Column headers, in sheet order (row 1). */
  headers: string[];
  /** Data rows as arrays aligned to `headers`; short rows are padded with "". */
  rows: string[][];
  /** Same rows as header-keyed objects, for convenience. */
  records: Record<string, string>[];
};

export class SheetsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetsNotConfiguredError";
  }
}

export class SheetsAccessError extends Error {
  constructor(
    message: string,
    public readonly spreadsheetId: string,
    public readonly tab: string,
  ) {
    super(message);
    this.name = "SheetsAccessError";
  }
}
