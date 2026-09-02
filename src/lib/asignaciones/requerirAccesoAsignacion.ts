import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";

export interface AsignacionAcceso {
  id: string;
  materia_id: string;
  grupo_id: string;
  docente_perfil_id: string;
  ciclo_escolar_id: string;
  parcial1_max: number | null;
  parcial2_max: number | null;
  producto_max: number | null;
}

export async function requerirAccesoAsignacion(asignacionId: string): Promise<AsignacionAcceso> {
  const perfil = await obtenerPerfilActual();

  if (!perfil) {
    throw new Error("No tienes permiso para esta acción.");
  }

  const supabase = await createClient();

  const { data: asignacion, error } = await supabase
    .from("asignaciones")
    .select(
      "id, materia_id, grupo_id, docente_perfil_id, ciclo_escolar_id, parcial1_max, parcial2_max, producto_max"
    )
    .eq("id", asignacionId)
    .single();

  if (error || !asignacion) {
    throw new Error("No se encontró la asignación.");
  }

  const tieneAcceso =
    perfil.rol === "super_admin" ||
    perfil.rol === "direccion" ||
    (perfil.rol === "docente" && asignacion.docente_perfil_id === perfil.id);

  if (!tieneAcceso) {
    throw new Error("No tienes permiso para esta acción.");
  }

  return asignacion;
}
