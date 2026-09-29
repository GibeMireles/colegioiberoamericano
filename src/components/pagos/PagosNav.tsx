"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive } from "@/lib/nav";

const ITEMS = [
  { label: "Alumnos", href: "/pagos" },
  { label: "Adeudos", href: "/pagos/adeudos" },
  { label: "Corte de caja", href: "/pagos/corte" },
  { label: "Configuración", href: "/pagos/configuracion" },
];

function estaActivo(pathname: string, href: string): boolean {
  if (href === "/pagos") {
    // "Alumnos" cubre la búsqueda, el estado de cuenta y los recibos.
    return (
      pathname === "/pagos" ||
      pathname.startsWith("/pagos/alumno/") ||
      pathname.startsWith("/pagos/recibo/")
    );
  }
  return isNavItemActive(pathname, href);
}

export function PagosNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-zinc-200 print:hidden" aria-label="Secciones de Pagos">
      {ITEMS.map((item) => {
        const activo = estaActivo(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              activo
                ? "border-primario text-zinc-900"
                : "border-transparent text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
