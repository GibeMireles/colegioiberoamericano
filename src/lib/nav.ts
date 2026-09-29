import type { Rol } from "@/lib/roles";

export interface NavItem {
  label: string;
  href: string;
  rolesPermitidos?: Rol[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Alumnos y grados", href: "/alumnos" },
  { label: "Pagos", href: "/pagos", rolesPermitidos: ["super_admin", "direccion", "caja"] },
  { label: "Listas / Asistencia", href: "/asistencia" },
  { label: "Materias", href: "/materias", rolesPermitidos: ["super_admin", "direccion"] },
  {
    label: "Calificaciones",
    href: "/calificaciones",
    rolesPermitidos: ["super_admin", "direccion", "docente"],
  },
  { label: "Usuarios", href: "/usuarios", rolesPermitidos: ["super_admin"] },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemsVisibles(rol: Rol | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      !item.rolesPermitidos || (rol !== null && item.rolesPermitidos.includes(rol))
  );
}
