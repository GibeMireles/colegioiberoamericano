"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { obtenerCicloActivoId } from "@/lib/ciclos/activo";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { conceptoSchema, esUuid, planPagoSchema, precioSchema } from "@/lib/pagos/schema";

const RUTA = "/pagos/configuracion";

export async function actualizarPlan(planId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = planPagoSchema.safeParse({
    primerMes: formData.get("primerMes"),
    diaVencimiento: formData.get("diaVencimiento"),
  });
  if (!resultado.success || !esUuid(planId)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planes_pago")
    .update({
      primer_mes: `${resultado.data.primerMes}-01`,
      dia_vencimiento: resultado.data.diaVencimiento,
    })
    .eq("id", planId);

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=plan`);
}

// Campos del formulario: "precio:<planId>:<nivelId>". Vacío = sin precio.
export async function guardarPrecios(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const aGuardar: { plan_pago_id: string; nivel_id: string; monto_mensual: number }[] = [];
  const aQuitar: { planPagoId: string; nivelId: string }[] = [];

  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("precio:")) {
      continue;
    }
    const [, planPagoId, nivelId] = clave.split(":");
    const texto = typeof valor === "string" ? valor.trim() : "";

    if (texto === "") {
      if (esUuid(planPagoId) && esUuid(nivelId)) {
        aQuitar.push({ planPagoId, nivelId });
      }
      continue;
    }

    const resultado = precioSchema.safeParse({ planPagoId, nivelId, montoMensual: texto });
    if (!resultado.success) {
      redirect(`${RUTA}?error=validacion`);
    }
    aGuardar.push({
      plan_pago_id: resultado.data.planPagoId,
      nivel_id: resultado.data.nivelId,
      monto_mensual: resultado.data.montoMensual,
    });
  }

  const supabase = await createClient();

  if (aGuardar.length > 0) {
    const { error } = await supabase
      .from("precios_colegiatura")
      .upsert(aGuardar, { onConflict: "plan_pago_id,nivel_id" });
    if (error) {
      redirect(`${RUTA}?error=${codigoDeError(error)}`);
    }
  }

  for (const { planPagoId, nivelId } of aQuitar) {
    const { error } = await supabase
      .from("precios_colegiatura")
      .delete()
      .eq("plan_pago_id", planPagoId)
      .eq("nivel_id", nivelId);
    if (error) {
      redirect(`${RUTA}?error=${codigoDeError(error)}`);
    }
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=precios`);
}

export async function crearConcepto(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = conceptoSchema.safeParse({
    nombre: formData.get("nombre"),
    montoDefault: formData.get("montoDefault") ?? undefined,
    aplicaBeca: formData.get("aplicaBeca") === "on",
  });
  if (!resultado.success) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("conceptos_pago").insert({
    nombre: resultado.data.nombre,
    monto_default: resultado.data.montoDefault,
    aplica_beca: resultado.data.aplicaBeca,
  });

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=concepto`);
}

export async function actualizarConcepto(conceptoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const resultado = conceptoSchema.safeParse({
    nombre: formData.get("nombre"),
    montoDefault: formData.get("montoDefault") ?? undefined,
    aplicaBeca: formData.get("aplicaBeca") === "on",
  });
  if (!resultado.success || !esUuid(conceptoId)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const supabase = await createClient();
  const { data: actual, error: errorActual } = await supabase
    .from("conceptos_pago")
    .select("es_colegiatura")
    .eq("id", conceptoId)
    .maybeSingle();
  if (errorActual || !actual) {
    redirect(`${RUTA}?error=${codigoDeError(errorActual)}`);
  }

  // La colegiatura siempre aplica beca y no se puede desactivar: es la
  // que usa generar_colegiaturas.
  const esColegiatura = actual.es_colegiatura;
  const { error } = await supabase
    .from("conceptos_pago")
    .update({
      nombre: resultado.data.nombre,
      monto_default: resultado.data.montoDefault,
      aplica_beca: esColegiatura ? true : resultado.data.aplicaBeca,
      activo: esColegiatura ? true : formData.get("activo") === "on",
    })
    .eq("id", conceptoId);

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=concepto`);
}

export async function generarColegiaturas(formData: FormData) {
  await requerirRol(ROLES_PAGOS);

  const grupoId = formData.get("grupoId");
  const grupo = typeof grupoId === "string" && grupoId !== "" ? grupoId : null;
  if (grupo !== null && !esUuid(grupo)) {
    redirect(`${RUTA}?error=validacion`);
  }

  const cicloId = await obtenerCicloActivoId();
  if (!cicloId) {
    redirect(`${RUTA}?error=sin_ciclo`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generar_colegiaturas", {
    p_ciclo_id: cicloId,
    p_grupo_id: grupo,
  });

  if (error) {
    redirect(`${RUTA}?error=${codigoDeError(error)}`);
  }

  revalidatePath("/pagos", "layout");
  redirect(`${RUTA}?creados=${Number(data?.creados ?? 0)}`);
}
