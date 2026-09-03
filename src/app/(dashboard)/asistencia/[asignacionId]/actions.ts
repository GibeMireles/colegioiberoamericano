"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacion } from "@/lib/asignaciones/requerirAccesoAsignacion";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { asistenciaSchema } from "@/lib/asistencia/schema";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";

export async function guardarAsistencia(asignacionId: string, formData: FormData) {
  await requerirAccesoAsignacion(asignacionId);

  const fecha = formData.get("fecha");
  if (typeof fecha !== "string" || fecha.trim().length === 0) {
    throw new Error("Falta la fecha.");
  }

  const perfil = await obtenerPerfilActual();
  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const filas = alumnos.map((alumno) => {
    const { estatus } = asistenciaSchema.parse({
      estatus: formData.get(`estatus-${alumno.id}`) ?? undefined,
    });

    return {
      asignacion_id: asignacionId,
      alumno_id: alumno.id,
      fecha,
      estatus,
      registrado_por: perfil?.id ?? null,
    };
  });

  if (filas.length > 0) {
    const { error } = await supabase
      .from("asistencias")
      .upsert(filas, { onConflict: "asignacion_id,alumno_id,fecha" });

    if (error) {
      throw new Error(`No se pudo guardar la asistencia: ${error.message}`);
    }
  }

  revalidatePath(`/asistencia/${asignacionId}`);
  redirect(`/asistencia/${asignacionId}?fecha=${fecha}&guardado=1`);
}
