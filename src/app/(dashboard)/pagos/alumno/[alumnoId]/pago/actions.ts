"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { registrarPagoSchema } from "@/lib/pagos/schema";

export async function registrarPago(alumnoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);
  const rutaFormulario = `/pagos/alumno/${alumnoId}/pago`;

  const cargoIds = formData.getAll("cargo").filter((v): v is string => typeof v === "string");
  const resultado = registrarPagoSchema.safeParse({
    alumnoId,
    metodo: formData.get("metodo"),
    referencia: formData.get("referencia") ?? undefined,
    aplicaciones: cargoIds.map((cargoId) => ({
      cargoId,
      monto: formData.get(`monto-${cargoId}`),
    })),
  });

  if (!resultado.success) {
    redirect(`${rutaFormulario}?error=validacion`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_pago", {
    p_alumno_id: resultado.data.alumnoId,
    p_metodo: resultado.data.metodo,
    p_referencia: resultado.data.referencia,
    p_aplicaciones: resultado.data.aplicaciones.map((a) => ({ cargo_id: a.cargoId, monto: a.monto })),
  });

  if (error || !data?.pago_id) {
    redirect(`${rutaFormulario}?error=${codigoDeError(error)}`);
  }

  revalidatePath(`/pagos/alumno/${alumnoId}`);
  redirect(`/pagos/recibo/${data.pago_id}?nuevo=1`);
}
