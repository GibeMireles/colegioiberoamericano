"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { requerirRol } from "@/lib/perfiles/requerirRol";

export async function guardarListaMateria(materiaId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No se pudo guardar la lista: no hay un ciclo escolar activo.");
  }

  const alumnoIds = formData.getAll("alumno_id").map((valor) => String(valor));
  const supabase = await createClient();

  const { error: errorBorrado } = await supabase
    .from("materia_alumnos")
    .delete()
    .eq("materia_id", materiaId)
    .eq("ciclo_escolar_id", cicloId);

  if (errorBorrado) {
    throw new Error(`No se pudo guardar la lista: ${errorBorrado.message}`);
  }

  if (alumnoIds.length > 0) {
    const { error: errorInsercion } = await supabase.from("materia_alumnos").insert(
      alumnoIds.map((alumnoId) => ({
        materia_id: materiaId,
        alumno_id: alumnoId,
        ciclo_escolar_id: cicloId,
      }))
    );

    if (errorInsercion) {
      throw new Error(`No se pudo guardar la lista: ${errorInsercion.message}`);
    }
  }

  const { data: materia } = await supabase
    .from("materias")
    .select("grado_id")
    .eq("id", materiaId)
    .single();

  revalidatePath(`/materias/grado/${materia?.grado_id ?? ""}`);
  revalidatePath(`/materias/${materiaId}/lista`);
}
