import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gehalten als Literal statt Import aus lib/preferences.ts, damit das
// Middleware-Bundle (Edge-Runtime) next/headers nicht mitziehen muss.
const MODE_COOKIE = "aa_mode";

export function proxy(request: NextRequest) {
  const mode = request.cookies.get(MODE_COOKIE)?.value;
  if (!mode && request.nextUrl.pathname !== "/einstellungen") {
    const url = request.nextUrl.clone();
    url.pathname = "/einstellungen";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
