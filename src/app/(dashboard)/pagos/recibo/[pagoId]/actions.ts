"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES_PAGOS } from "@/lib/pagos/catalogos";
import { codigoDeError } from "@/lib/pagos/errores";
import { esUuid, motivoSchema } from "@/lib/pagos/schema";

export async function anularPago(pagoId: string, formData: FormData) {
  await requerirRol(ROLES_PAGOS);
  const ruta = `/pagos/recibo/${pagoId}`;

  const resultado = motivoSchema.safeParse({ motivo: formData.get("motivo") });
  if (!resultado.success || !esUuid(pagoId)) {
    redirect(`${ruta}?error=validacion`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_pago", {
    p_pago_id: pagoId,
    p_motivo: resultado.data.motivo,
  });

  if (error) {
    redirect(`${ruta}?error=${codigoDeError(error)}`);
  }

  revalidatePath("/pagos", "layout");
  redirect(`${ruta}?ok=anulado`);
}
