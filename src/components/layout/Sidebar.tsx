"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/10 bg-white p-4"
      aria-label="Navegación principal"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primario-activo text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
