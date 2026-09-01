"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alumnoSchema } from "@/lib/alumnos/schema";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";

function parseAlumnoFormData(formData: FormData) {
  return alumnoSchema.parse({
    nombres: formData.get("nombres") ?? undefined,
    apellido_paterno: formData.get("apellido_paterno") ?? undefined,
    apellido_materno: formData.get("apellido_materno") ?? undefined,
    fecha_nacimiento: formData.get("fecha_nacimiento") ?? undefined,
    matricula: formData.get("matricula") ?? undefined,
    tutor_nombre: formData.get("tutor_nombre") ?? undefined,
    tutor_telefono: formData.get("tutor_telefono") ?? undefined,
    tutor_email: formData.get("tutor_email") ?? undefined,
  });
}

export async function crearAlumno(grupoId: string, formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = await createClient();

  const cicloId = await obtenerCicloActivoId();

  if (!cicloId) {
    throw new Error("No se pudo inscribir al alumno: no hay un ciclo escolar activo.");
  }

  const { data: alumno, error: errorAlumno } = await supabase
    .from("alumnos")
    .insert(datos)
    .select("id")
    .single();

  if (errorAlumno || !alumno) {
    throw new Error(`No se pudo crear el alumno: ${errorAlumno?.message}`);
  }

  const { error: errorInscripcion } = await supabase.from("inscripciones").insert({
    alumno_id: alumno.id,
    grupo_id: grupoId,
    ciclo_escolar_id: cicloId,
  });

  if (errorInscripcion) {
    throw new Error(`No se pudo inscribir al alumno: ${errorInscripcion.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
  redirect(`/alumnos/grupo/${grupoId}`);
}

export async function actualizarAlumno(
  id: string,
  grupoId: string,
  formData: FormData
) {
  const datos = parseAlumnoFormData(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("alumnos").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo actualizar el alumno: ${error.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
  redirect(`/alumnos/grupo/${grupoId}`);
}

export async function alternarActivoAlumno(
  id: string,
  grupoId: string,
  activo: boolean
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("alumnos")
    .update({ activo: !activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estatus del alumno: ${error.message}`);
  }

  revalidatePath(`/alumnos/grupo/${grupoId}`);
}
