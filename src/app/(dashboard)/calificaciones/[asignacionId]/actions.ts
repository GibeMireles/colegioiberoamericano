"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirAccesoAsignacion } from "@/lib/asignaciones/requerirAccesoAsignacion";
import { obtenerAlumnosDeAsignacion } from "@/lib/calificaciones/roster";
import { calificacionSchema, ponderacionSchema } from "@/lib/calificaciones/schema";
import { calcularSubtotal } from "@/lib/calificaciones/calculos";

export async function guardarPonderacion(asignacionId: string, formData: FormData) {
  await requerirAccesoAsignacion(asignacionId);

  const { parcial1_max, parcial2_max, producto_max } = ponderacionSchema.parse({
    parcial1_max: formData.get("parcial1_max") ?? undefined,
    parcial2_max: formData.get("parcial2_max") ?? undefined,
    producto_max: formData.get("producto_max") ?? undefined,
  });

  const supabase = await createClient();

  const { error } = await supabase
    .from("asignaciones")
    .update({ parcial1_max, parcial2_max, producto_max })
    .eq("id", asignacionId);

  if (error) {
    throw new Error(`No se pudo guardar la ponderación: ${error.message}`);
  }

  revalidatePath(`/calificaciones/${asignacionId}`);
}

export async function guardarCalificaciones(asignacionId: string, formData: FormData) {
  const asignacion = await requerirAccesoAsignacion(asignacionId);

  if (
    asignacion.parcial1_max === null ||
    asignacion.parcial2_max === null ||
    asignacion.producto_max === null
  ) {
    throw new Error("Define la ponderación antes de capturar calificaciones.");
  }

  const alumnos = await obtenerAlumnosDeAsignacion(asignacionId);
  const supabase = await createClient();

  const filas = alumnos.flatMap((alumno) => {
    const bruto = calificacionSchema.parse({
      parcial1_adas: formData.get(`parcial1_adas-${alumno.id}`) ?? undefined,
      parcial1_examen: formData.get(`parcial1_examen-${alumno.id}`) ?? undefined,
      parcial2_adas: formData.get(`parcial2_adas-${alumno.id}`) ?? undefined,
      parcial2_examen: formData.get(`parcial2_examen-${alumno.id}`) ?? undefined,
      producto_proyecto: formData.get(`producto_proyecto-${alumno.id}`) ?? undefined,
      producto_examen: formData.get(`producto_examen-${alumno.id}`) ?? undefined,
    });

    const sinCapturar =
      bruto.parcial1_adas === undefined &&
      bruto.parcial1_examen === undefined &&
      bruto.parcial2_adas === undefined &&
      bruto.parcial2_examen === undefined &&
      bruto.producto_proyecto === undefined &&
      bruto.producto_examen === undefined;

    if (sinCapturar) {
      return [];
    }

    const nombreCompleto = [alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres]
      .filter(Boolean)
      .join(" ");

    const calif1 = calcularSubtotal(bruto.parcial1_adas ?? null, bruto.parcial1_examen ?? null);
    if (calif1 > asignacion.parcial1_max!) {
      throw new Error(`${nombreCompleto}: el Parcial 1 no puede superar ${asignacion.parcial1_max} puntos.`);
    }

    const calif2 = calcularSubtotal(bruto.parcial2_adas ?? null, bruto.parcial2_examen ?? null);
    if (calif2 > asignacion.parcial2_max!) {
      throw new Error(`${nombreCompleto}: el Parcial 2 no puede superar ${asignacion.parcial2_max} puntos.`);
    }

    const subtotalProducto = calcularSubtotal(
      bruto.producto_proyecto ?? null,
      bruto.producto_examen ?? null
    );
    if (subtotalProducto > asignacion.producto_max!) {
      throw new Error(`${nombreCompleto}: el Producto no puede superar ${asignacion.producto_max} puntos.`);
    }

    return [
      {
        asignacion_id: asignacionId,
        alumno_id: alumno.id,
        parcial1_adas: bruto.parcial1_adas ?? null,
        parcial1_examen: bruto.parcial1_examen ?? null,
        parcial2_adas: bruto.parcial2_adas ?? null,
        parcial2_examen: bruto.parcial2_examen ?? null,
        producto_proyecto: bruto.producto_proyecto ?? null,
        producto_examen: bruto.producto_examen ?? null,
        actualizado_en: new Date().toISOString(),
      },
    ];
  });

  if (filas.length > 0) {
    const { error } = await supabase
      .from("calificaciones")
      .upsert(filas, { onConflict: "asignacion_id,alumno_id" });

    if (error) {
      throw new Error(`No se pudieron guardar las calificaciones: ${error.message}`);
    }
  }

  revalidatePath(`/calificaciones/${asignacionId}`);
  redirect(`/calificaciones/${asignacionId}?guardado=1`);
}
