import { notFound } from "next/navigation";
import { obtenerPerfilActual, type PerfilActual } from "@/lib/perfiles/actual";
import type { Rol } from "@/lib/roles";

export async function requerirRolPagina(rolesPermitidos: Rol[]): Promise<PerfilActual> {
  const perfil = await obtenerPerfilActual();

  if (!perfil || !rolesPermitidos.includes(perfil.rol)) {
    notFound();
  }

  return perfil;
}
