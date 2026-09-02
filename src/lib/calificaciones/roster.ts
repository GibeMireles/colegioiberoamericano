import { createClient } from "@/lib/supabase/server";
import type { AlumnoDeMateria } from "@/lib/materias/roster";

export async function obtenerAlumnosDeAsignacion(asignacionId: string): Promise<AlumnoDeMateria[]> {
  const supabase = await createClient();

  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones")
    .select("materia_id, grupo_id, ciclo_escolar_id")
    .eq("id", asignacionId)
    .single();

  if (errorAsignacion || !asignacion) {
    throw new Error("No se encontró la asignación.");
  }

  // Embed sancionado (ver Global Constraints del plan): inscripciones -> alumnos.
  const { data: inscripciones, error: errorInscripciones } = await supabase
    .from("inscripciones")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("grupo_id", asignacion.grupo_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorInscripciones) {
    throw new Error(`No se pudo cargar la lista de alumnos: ${errorInscripciones.message}`);
  }

  const alumnosDelGrupo = (inscripciones ?? []).flatMap((inscripcion) => inscripcion.alumnos);

  // Embed sancionado (ver Global Constraints del plan): materia_alumnos -> alumnos.
  const { data: listaPropia, error: errorLista } = await supabase
    .from("materia_alumnos")
    .select("alumnos(id, nombres, apellido_paterno, apellido_materno)")
    .eq("materia_id", asignacion.materia_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorLista) {
    throw new Error(`No se pudo cargar la lista de la materia: ${errorLista.message}`);
  }

  if (!listaPropia || listaPropia.length === 0) {
    return alumnosDelGrupo;
  }

  const idsListaPropia = new Set(
    listaPropia.flatMap((fila) => fila.alumnos).map((alumno) => alumno.id)
  );

  return alumnosDelGrupo.filter((alumno) => idsListaPropia.has(alumno.id));
}
