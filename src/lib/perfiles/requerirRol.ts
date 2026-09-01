import { obtenerPerfilActual, type PerfilActual } from "@/lib/perfiles/actual";
import type { Rol } from "@/lib/roles";

export async function requerirRol(rolesPermitidos: Rol[]): Promise<PerfilActual> {
  const perfil = await obtenerPerfilActual();

  if (!perfil || !rolesPermitidos.includes(perfil.rol)) {
    throw new Error("No tienes permiso para esta acción.");
  }

  return perfil;
}
