/**
 * Sheet columns are hand-maintained by the Regelwerk and can shift naming
 * slightly over time, so lookups are case-insensitive and match on any of
 * several candidate header names rather than a single hardcoded string.
 */
export function getField(
  record: Record<string, string>,
  ...candidates: string[]
): string {
  const keys = Object.keys(record);
  for (const candidate of candidates) {
    const exact = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (exact) return record[exact] ?? "";
  }
  for (const candidate of candidates) {
    const partial = keys.find((k) =>
      k.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (partial) return record[partial] ?? "";
  }
  return "";
}

export function countByField(
  records: Record<string, string>[],
  candidates: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = getField(record, ...candidates).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function distinctValues(
  records: Record<string, string>[],
  header: string,
): string[] {
  const set = new Set<string>();
  for (const record of records) {
    const value = (record[header] ?? "").trim();
    if (value) set.add(value);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
}
