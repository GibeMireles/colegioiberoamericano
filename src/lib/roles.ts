export const ROLES = ["super_admin", "direccion", "caja", "docente"] as const;

export type Rol = (typeof ROLES)[number];
