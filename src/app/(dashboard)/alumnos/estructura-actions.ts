"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nombreEstructuraSchema } from "@/lib/estructura/schema";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { requerirRol } from "@/lib/perfiles/requerirRol";

function parseNombre(formData: FormData) {
  return nombreEstructuraSchema.parse({
    nombre: formData.get("nombre") ?? undefined,
  });
}

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

// ---------- Niveles ----------

export async function crearNivel(formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const { data: maxOrden } = await supabase
    .from("niveles")
    .select("orden")
    .order("orden", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("niveles")
    .insert({ nombre, orden: (maxOrden?.orden ?? 0) + 1 });

  manejarError(error, "Ya existe un nivel con ese nombre.", "No se pudo crear el nivel");

  revalidatePath("/alumnos");
}

export async function renombrarNivel(id: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("niveles").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un nivel con ese nombre.", "No se pudo renombrar el nivel");

  revalidatePath("/alumnos");
}

export async function eliminarNivel(id: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { count, error: errorConteo } = await supabase
    .from("grados")
    .select("id", { count: "exact", head: true })
    .eq("nivel_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el nivel: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este nivel tiene grados dentro.");
  }

  const { error } = await supabase.from("niveles").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el nivel: ${error.message}`);
  }

  revalidatePath("/alumnos");
}

// ---------- Grados ----------

export async function crearGrado(nivelId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const { data: maxOrden } = await supabase
    .from("grados")
    .select("orden")
    .eq("nivel_id", nivelId)
    .order("orden", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("grados")
    .insert({ nombre, nivel_id: nivelId, orden: (maxOrden?.orden ?? 0) + 1 });

  manejarError(error, "Ya existe un grado con ese nombre en este nivel.", "No se pudo crear el grado");

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

export async function renombrarGrado(id: string, nivelId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("grados").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un grado con ese nombre en este nivel.", "No se pudo renombrar el grado");

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

export async function eliminarGrado(id: string, nivelId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { count, error: errorConteo } = await supabase
    .from("grupos")
    .select("id", { count: "exact", head: true })
    .eq("grado_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el grado: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este grado tiene grupos dentro.");
  }

  const { error } = await supabase.from("grados").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el grado: ${error.message}`);
  }

  revalidatePath(`/alumnos/nivel/${nivelId}`);
}

// ---------- Grupos ----------

export async function crearGrupo(gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const cicloId = await obtenerCicloActivoId();

  if (!cicloId) {
    throw new Error("No se pudo crear el grupo: no hay un ciclo escolar activo.");
  }

  const { error } = await supabase
    .from("grupos")
    .insert({ nombre, grado_id: gradoId, ciclo_escolar_id: cicloId });

  manejarError(error, "Ya existe un grupo con ese nombre en este grado.", "No se pudo crear el grupo");

  revalidatePath(`/alumnos/grado/${gradoId}`);
}

export async function renombrarGrupo(id: string, gradoId: string, formData: FormData) {
  await requerirRol(["super_admin", "direccion"]);
  const { nombre } = parseNombre(formData);
  const supabase = await createClient();

  const { error } = await supabase.from("grupos").update({ nombre }).eq("id", id);

  manejarError(error, "Ya existe un grupo con ese nombre en este grado.", "No se pudo renombrar el grupo");

  revalidatePath(`/alumnos/grado/${gradoId}`);
}

export async function eliminarGrupo(id: string, gradoId: string) {
  await requerirRol(["super_admin", "direccion"]);
  const supabase = await createClient();

  const { count, error: errorConteo } = await supabase
    .from("inscripciones")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", id);

  if (errorConteo) {
    throw new Error(`No se pudo verificar el grupo: ${errorConteo.message}`);
  }
  if (count && count > 0) {
    throw new Error("No se puede eliminar: este grupo tiene alumnos inscritos.");
  }

  const { error } = await supabase.from("grupos").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el grupo: ${error.message}`);
  }

  revalidatePath(`/alumnos/grado/${gradoId}`);
}
