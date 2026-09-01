"use client";

import { useState, useTransition } from "react";
import { savePreferences } from "@/lib/actions";
import type { Mode } from "@/lib/preferences";
import type { OpenMarketSegment } from "@/lib/config";

export function SegmentPicker({
  branchSegments,
  initialMode,
  initialBranches,
}: {
  branchSegments: OpenMarketSegment[];
  initialMode: Mode | null;
  initialBranches: string[];
}) {
  const [mode, setMode] = useState<Mode | null>(initialMode);
  const [branches, setBranches] = useState<string[]>(initialBranches);
  const [isPending, startTransition] = useTransition();

  const canSave = mode === "interim" || (mode === "branchen" && branches.length > 0);

  function toggleBranch(slug: string) {
    setBranches((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleSave() {
    if (!mode || !canSave) return;
    startTransition(async () => {
      await savePreferences(mode, branches);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Was interessiert dich?
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Wähle deinen Fokus. Interim zeigt dir ausschließlich Interim-Chancen
          aus beiden Radaren. Branchen lässt dich frei eine oder mehrere
          Fachbereiche für das Open Market Radar auswählen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("interim")}
          className={`rounded-lg border p-4 text-left transition ${
            mode === "interim"
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          }`}
        >
          <p className="font-medium">Interim</p>
          <p
            className={`mt-1 text-sm ${
              mode === "interim" ? "opacity-80" : "text-neutral-500"
            }`}
          >
            Nur Interim Demand Radar, Zielunternehmen &amp; Interim-Leads aus
            dem Open Market Radar. Keine Branchenauswahl nötig.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("branchen")}
          className={`rounded-lg border p-4 text-left transition ${
            mode === "branchen"
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          }`}
        >
          <p className="font-medium">Branchen</p>
          <p
            className={`mt-1 text-sm ${
              mode === "branchen" ? "opacity-80" : "text-neutral-500"
            }`}
          >
            Frei wählbar: eine oder mehrere Fachbereiche aus dem Open Market
            Radar. Kein Interim Demand Radar.
          </p>
        </button>
      </div>

      {mode === "branchen" && (
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Fachbereiche auswählen
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {branchSegments.map((seg) => (
              <label
                key={seg.slug}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <input
                  type="checkbox"
                  checked={branches.includes(seg.slug)}
                  onChange={() => toggleBranch(seg.slug)}
                  className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                />
                {seg.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave || isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-blue-700"
      >
        {isPending ? "Speichern…" : "Auswahl speichern"}
      </button>
    </div>
  );
}
