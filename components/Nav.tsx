"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { OpenMarketSegment } from "@/lib/config";
import type { Mode } from "@/lib/preferences";

export function Nav({
  mode,
  visibleSegments,
}: {
  mode: Mode | null;
  visibleSegments: OpenMarketSegment[];
}) {
  const pathname = usePathname();
  const [openMarketOpen, setOpenMarketOpen] = useState(false);

  const links = [
    { href: "/", label: "Übersicht" },
    ...(mode === "interim"
      ? [
          { href: "/interim-radar", label: "Interim Demand Radar" },
          { href: "/interim-zielunternehmen", label: "Zielunternehmen" },
        ]
      : []),
    { href: "/regelwerk", label: "Regelwerk" },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 font-semibold text-neutral-900 dark:text-neutral-50">
          Acquisition Agent
        </Link>
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} active={pathname === link.href}>
            {link.label}
          </NavLink>
        ))}

        {mode && (
          <div
            className="relative"
            onMouseEnter={() => setOpenMarketOpen(true)}
            onMouseLeave={() => setOpenMarketOpen(false)}
          >
            <NavLink href="/open-market" active={pathname.startsWith("/open-market")}>
              Open Market Radar ▾
            </NavLink>
            {openMarketOpen && (
              <div className="absolute left-0 top-full z-20 min-w-[220px] rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                <Link
                  href="/open-market"
                  className="block px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Alle Segmente
                </Link>
                <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                {visibleSegments.map((seg) => (
                  <Link
                    key={seg.slug}
                    href={`/open-market/${seg.slug}`}
                    className="block px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {seg.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                <Link
                  href="/open-market/suchlaeufe"
                  className="block px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Suchläufe
                </Link>
                <Link
                  href="/open-market/agent-state"
                  className="block px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Agent State
                </Link>
              </div>
            )}
          </div>
        )}

        <Link
          href="/einstellungen"
          className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {mode === "interim"
            ? "Modus: Interim"
            : mode === "branchen"
              ? "Modus: Branchen"
              : "Einstellungen"}
        </Link>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}
