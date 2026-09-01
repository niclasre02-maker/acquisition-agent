"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BRANCH_SEGMENT_SLUGS } from "./config";
import { BRANCHES_COOKIE, MODE_COOKIE, type Mode } from "./preferences";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function savePreferences(mode: Mode, branches: string[]) {
  const jar = await cookies();
  const validBranches = branches.filter((slug) => BRANCH_SEGMENT_SLUGS.includes(slug));

  jar.set(MODE_COOKIE, mode, { maxAge: ONE_YEAR_SECONDS, path: "/" });
  if (mode === "branchen" && validBranches.length > 0) {
    jar.set(BRANCHES_COOKIE, validBranches.join(","), {
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
    });
  } else {
    jar.delete(BRANCHES_COOKIE);
  }

  redirect("/");
}

export async function resetPreferences() {
  const jar = await cookies();
  jar.delete(MODE_COOKIE);
  jar.delete(BRANCHES_COOKIE);
  redirect("/einstellungen");
}
