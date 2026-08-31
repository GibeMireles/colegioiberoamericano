"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alumnoSchema } from "@/lib/alumnos/schema";

const GRUPO_PILOTO_ID = process.env.GRUPO_PILOTO_ID!;
const CICLO_PILOTO_ID = process.env.CICLO_PILOTO_ID!;

function parseAlumnoFormData(formData: FormData) {
  return alumnoSchema.parse({
    nombre_completo: formData.get("nombre_completo") ?? undefined,
    fecha_nacimiento: formData.get("fecha_nacimiento") ?? undefined,
    matricula: formData.get("matricula") ?? undefined,
    tutor_nombre: formData.get("tutor_nombre") ?? undefined,
    tutor_telefono: formData.get("tutor_telefono") ?? undefined,
    tutor_email: formData.get("tutor_email") ?? undefined,
  });
}

export async function crearAlumno(formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

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
    grupo_id: GRUPO_PILOTO_ID,
    ciclo_escolar_id: CICLO_PILOTO_ID,
  });

  if (errorInscripcion) {
    throw new Error(`No se pudo inscribir al alumno: ${errorInscripcion.message}`);
  }

  revalidatePath("/alumnos");
  redirect("/alumnos");
}

export async function actualizarAlumno(id: string, formData: FormData) {
  const datos = parseAlumnoFormData(formData);
  const supabase = createClient();

  const { error } = await supabase.from("alumnos").update(datos).eq("id", id);

  if (error) {
    throw new Error(`No se pudo actualizar el alumno: ${error.message}`);
  }

  revalidatePath("/alumnos");
  redirect("/alumnos");
}

export async function alternarActivoAlumno(id: string, activo: boolean) {
  const supabase = createClient();

  const { error } = await supabase
    .from("alumnos")
    .update({ activo: !activo })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo cambiar el estatus del alumno: ${error.message}`);
  }

  revalidatePath("/alumnos");
}
