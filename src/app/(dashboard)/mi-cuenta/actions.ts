"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/perfiles/requerirRol";
import { ROLES } from "@/lib/roles";
import { actualizarContrasenaSchema } from "@/lib/cuenta/schema";

export async function actualizarContrasena(formData: FormData) {
  await requerirRol([...ROLES]);

  const resultado = actualizarContrasenaSchema.safeParse({
    contrasena: formData.get("contrasena") ?? undefined,
    confirmar: formData.get("confirmar") ?? undefined,
  });

  if (!resultado.success) {
    redirect("/mi-cuenta?error=validacion");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: resultado.data.contrasena,
  });

  if (error) {
    redirect("/mi-cuenta?error=actualizacion_fallida");
  }

  redirect("/mi-cuenta?guardado=1");
}
