"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { agregarCargoSchema, esUuid, motivoSchema, planBecaSchema } from "@/lib/pagos/schema";

function ruta(alumnoId: string) {
  return `/pagos/alumno/${alumnoId}`;
}

export async function actualizarPlanBeca(alumnoId: string, inscripcionId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = planBecaSchema.safeParse({
    planPagoId: formData.get("planPagoId") ?? undefined,
    becaPorcentaje: formData.get("becaPorcentaje"),
  });
  if (!resultado.success || !esUuid(alumnoId) || !esUuid(inscripcionId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("inscripciones")
    .update({
      plan_pago_id: resultado.data.planPagoId,
      beca_porcentaje: resultado.data.becaPorcentaje,
    })
    .eq("id", inscripcionId)
    .eq("alumno_id", alumnoId);

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=plan`);
}

export async function agregarCargo(alumnoId: string, formData: FormData) {
  const perfil = await requerirRol(ROLES_PAGOS);

  const resultado = agregarCargoSchema.safeParse({
    conceptoId: formData.get("conceptoId"),
    descripcion: formData.get("descripcion"),
    monto: formData.get("monto"),
    fechaVencimiento: formData.get("fechaVencimiento") ?? undefined,
  });
  if (!resultado.success || !esUuid(alumnoId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    redirect(`${ruta(alumnoId)}?error=sin_ciclo`);
  }

  const supabase = await createClient();
  const { data: concepto } = await supabase
    .from("conceptos_pago")
    .select("es_colegiatura, activo")
    .eq("id", resultado.data.conceptoId)
    .maybeSingle();
  if (!concepto || !concepto.activo) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }
  if (concepto.es_colegiatura) {
    redirect(`${ruta(alumnoId)}?error=concepto_colegiatura`);
  }

  // Los cargos sueltos nunca llevan beca (solo aplica a colegiaturas).
  const { error } = await supabase.from("cargos").insert({
    alumno_id: alumnoId,
    concepto_pago_id: resultado.data.conceptoId,
    ciclo_escolar_id: cicloId,
    descripcion: resultado.data.descripcion,
    monto_original: resultado.data.monto,
    beca_porcentaje: 0,
    monto: resultado.data.monto,
    fecha_vencimiento: resultado.data.fechaVencimiento,
    creado_por: perfil.id,
  });

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=cargo`);
}

export async function cancelarCargo(alumnoId: string, cargoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = motivoSchema.safeParse({ motivo: formData.get("motivo") });
  if (!resultado.success || !esUuid(alumnoId) || !esUuid(cargoId)) {
    redirect(`${ruta(alumnoId)}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_cargo", {
    p_cargo_id: cargoId,
    p_motivo: resultado.data.motivo,
  });

  if (error) {
    redirect(`${ruta(alumnoId)}?error=${codigoDeError(error)}`);
  }

  revalidatePath(ruta(alumnoId));
  redirect(`${ruta(alumnoId)}?ok=cancelado`);
}
