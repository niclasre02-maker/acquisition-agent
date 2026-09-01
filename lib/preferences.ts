import { cookies } from "next/headers";
import { BRANCH_SEGMENT_SLUGS } from "./config";

export const MODE_COOKIE = "aa_mode";
export const BRANCHES_COOKIE = "aa_branches";

export type Mode = "interim" | "branchen";

export type Preferences = {
  mode: Mode | null;
  /** Nur relevant wenn mode === "branchen": die frei gewählten Segment-Slugs. */
  branches: string[];
};

function parseMode(value: string | undefined): Mode | null {
  return value === "interim" || value === "branchen" ? value : null;
}

export async function getPreferences(): Promise<Preferences> {
  const jar = await cookies();
  const mode = parseMode(jar.get(MODE_COOKIE)?.value);
  const raw = jar.get(BRANCHES_COOKIE)?.value ?? "";
  const branches = raw
    .split(",")
    .map((s) => s.trim())
    .filter((slug) => BRANCH_SEGMENT_SLUGS.includes(slug));
  return { mode, branches };
}
