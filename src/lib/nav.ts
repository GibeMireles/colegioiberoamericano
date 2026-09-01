export interface NavItem {
  label: string;
  href: string;
  rolesPermitidos?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos" },
  { label: "Listas / Asistencia", href: "/asistencia" },
  { label: "Usuarios", href: "/usuarios", rolesPermitidos: ["super_admin"] },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemsVisibles(rol: string | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      !item.rolesPermitidos || (rol !== null && item.rolesPermitidos.includes(rol))
  );
}
