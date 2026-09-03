export const ROLES = ["super_admin", "direccion", "caja", "docente"] as const;

export type Rol = (typeof ROLES)[number];

export const ETIQUETAS_ROL: Record<Rol, string> = {
  super_admin: "Super admin",
  direccion: "Dirección",
  caja: "Caja",
  docente: "Docente",
};
