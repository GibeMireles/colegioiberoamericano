"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreEstructuraSchema } from "@/lib/estructura/schema";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { asignacionSchema } from "@/lib/asignaciones/schema";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";

function manejarError(
  error: { code?: string; message: string } | null,
  mensajeDuplicado: string,
  mensajeGenerico: string
) {
  if (!error) return;
  if (error.code === "23505") {
    throw new Error(mensajeDuplicado);
  }
  throw new Error(`${mensajeGenerico}: ${error.message}`);
}

export async function crearMateria(gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
  const supabase = await createClient();

  const { error } = await supabase
    .from("materias")
    .insert({ nombre, grado_id: gradoId });

  manejarError(
    error,
    "Ya existe una materia con ese nombre en este grado.",
    "No se pudo crear la materia"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function renombrarMateria(id: string, gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
  const supabase = await createClient();

  const { error } = await supabase.from("materias").update({ nombre }).eq("id", id);

  manejarError(
    error,
    "Ya existe una materia con ese nombre en este grado.",
    "No se pudo renombrar la materia"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function eliminarMateria(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No se pudo verificar la materia: no hay un ciclo escolar activo.");
  }

  const { count, error: errorConteo } = await supabase
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("materia_id", id)
    .eq("ciclo_escolar_id", cicloId);

  if (errorConteo) {
    throw new Error(`No se pudo verificar la materia: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: esta materia tiene un maestro asignado.");
  }

  const { error } = await supabase.from("materias").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar la materia: ${error.message}`);
  }

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function guardarAsignacion(
  materiaId: string,
  gradoId: string,
  formData: FormData
) {
  await requerirRol(["super_admin", "direccion"]);
  const { grupo_id, docente_perfil_id } = asignacionSchema.parse({
    grupo_id: formData.get("grupo_id") ?? undefined,
    docente_perfil_id: formData.get("docente_perfil_id") ?? undefined,
  });
  const supabase = await createClient();

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    throw new Error("No se pudo asignar: no hay un ciclo escolar activo.");
  }

  const { error } = await supabase.from("asignaciones").insert({
    materia_id: materiaId,
    grupo_id,
    docente_perfil_id,
    ciclo_escolar_id: cicloId,
  });

  manejarError(
    error,
    "Ya hay un maestro asignado a esta materia en este grupo y ciclo.",
    "No se pudo asignar el maestro"
  );

  revalidatePath(`/materias/grado/${gradoId}`);
}

export async function eliminarAsignacion(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones")
    .select("materia_id, ciclo_escolar_id")
    .eq("id", id)
    .single();

  if (errorAsignacion) {
    throw new Error(`No se pudo quitar la asignación: ${errorAsignacion.message}`);
  }

  const { error: errorLista } = await supabase
    .from("materia_alumnos")
    .delete()
    .eq("materia_id", asignacion.materia_id)
    .eq("ciclo_escolar_id", asignacion.ciclo_escolar_id);

  if (errorLista) {
    throw new Error(`No se pudo quitar la asignación: ${errorLista.message}`);
  }

  const { error } = await supabase.from("asignaciones").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo quitar la asignación: ${error.message}`);
  }

  revalidatePath(`/materias/grado/${gradoId}`);
}
