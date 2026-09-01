"use client";

import { useMemo, useState } from "react";
import { Badge } from "./Badge";

type SortDir = "asc" | "desc";

export function DataTable({
  headers,
  rows,
  filterColumns = [],
  badgeColumns = [],
  initialSortColumn,
}: {
  headers: string[];
  rows: string[][];
  filterColumns?: string[];
  badgeColumns?: string[];
  initialSortColumn?: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ column: string; dir: SortDir } | null>(
    initialSortColumn ? { column: initialSortColumn, dir: "desc" } : null,
  );

  const colIndex = useMemo(
    () => new Map(headers.map((h, i) => [h, i])),
    [headers],
  );

  const filterOptions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const col of filterColumns) {
      const idx = colIndex.get(col);
      if (idx === undefined) continue;
      const set = new Set<string>();
      for (const row of rows) {
        const v = (row[idx] ?? "").trim();
        if (v) set.add(v);
      }
      if (set.size > 0 && set.size <= 40) {
        map.set(col, Array.from(set).sort((a, b) => a.localeCompare(b, "de")));
      }
    }
    return map;
  }, [filterColumns, colIndex, rows]);

  const filtered = useMemo(() => {
    let result = rows;
    for (const [col, value] of Object.entries(filters)) {
      if (!value) continue;
      const idx = colIndex.get(col);
      if (idx === undefined) continue;
      result = result.filter((row) => row[idx] === value);
    }
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      const idx = colIndex.get(sort.column);
      if (idx !== undefined) {
        result = [...result].sort((a, b) => {
          const av = a[idx] ?? "";
          const bv = b[idx] ?? "";
          const an = parseFloat(av.replace(",", "."));
          const bn = parseFloat(bv.replace(",", "."));
          let cmp: number;
          if (!isNaN(an) && !isNaN(bn)) {
            cmp = an - bn;
          } else {
            cmp = av.localeCompare(bv, "de");
          }
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return result;
  }, [rows, filters, search, sort, colIndex]);

  function toggleSort(column: string) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, dir: "desc" };
      if (prev.dir === "desc") return { column, dir: "asc" };
      return null;
    });
  }

  if (headers.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Dieser Tab enthält aktuell keine Daten.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {Array.from(filterOptions.entries()).map(([col, options]) => (
          <select
            key={col}
            value={filters[col] ?? ""}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, [col]: e.target.value }))
            }
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">{col}: alle</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ))}
        <span className="ml-auto text-xs text-neutral-500">
          {filtered.length} / {rows.length} Zeilen
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  onClick={() => toggleSort(h)}
                  className="cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap text-neutral-600 select-none hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {h}
                  {sort?.column === h && (sort.dir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((row, i) => (
              <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                {row.map((cell, j) => (
                  <td key={j} className="max-w-xs px-3 py-2 align-top text-neutral-800 dark:text-neutral-200">
                    {badgeColumns.includes(headers[j]) ? (
                      <Badge value={cell} />
                    ) : (
                      <span className="block whitespace-pre-wrap">{cell || "–"}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-6 text-center text-neutral-400"
                >
                  Keine Treffer für die aktuelle Suche/Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
