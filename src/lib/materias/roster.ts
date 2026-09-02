import { createClient } from "@/lib/supabase/server";

export interface AlumnoDeMateria {
  id: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}

export async function obtenerAlumnosDelGrupoDeMateria(
  materiaId: string,
  cicloId: string
): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  const { data: asignaciones, error: errorAsignaciones } = await supabase
    .from("asignaciones")
    .select("grupo_id")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorAsignaciones) {
    throw new Error(`No se pudieron cargar las asignaciones: ${errorAsignaciones.message}`);
  }

  const grupoIds = (asignaciones ?? []).map((asignacion) => asignacion.grupo_id);

  if (grupoIds.length === 0) {
    return [];
  }

  // Embed sancionado (ver Global Constraints del plan): inscripciones -> alumnos.
  const { data: inscripciones, error: errorInscripciones } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .in("grupo_id", grupoIds)
    .eq("ciclo_escolar_id", cicloId);

  if (errorInscripciones) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${errorInscripciones.message}`);
  }

  return (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos ?? []);
}

export async function obtenerAlumnosDeMateria(
  materiaId: string,
  cicloId: string
): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  // Embed sancionado (ver Global Constraints del plan): materia_alumnos -> alumnos.
  const { data: listaPropia, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista de la materia: ${errorLista.message}`);
  }

  if (listaPropia && listaPropia.length > 0) {
    return listaPropia.flatMap((fila) => fila.alumnos ?? []);
  }

  return obtenerAlumnosDelGrupoDeMateria(materiaId, cicloId);
}
