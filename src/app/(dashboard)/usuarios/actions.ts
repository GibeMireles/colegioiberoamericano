"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { invitarMaestroSchema } from "@/lib/usuarios/schema";

export async function invitarDocente(formData: FormData) {
  const perfilActual = await obtenerPerfilActual();

  if (!perfilActual || perfilActual.rol !== "super_admin") {
    throw new Error("No tienes permiso para invitar maestros.");
  }

  const { correo, nombre_completo } = invitarMaestroSchema.parse({
    correo: formData.get("correo") ?? undefined,
    nombre_completo: formData.get("nombre_completo") ?? undefined,
  });

  const admin = createAdminClient();

  const { data, error: errorInvitacion } =
    await admin.auth.admin.inviteUserByEmail(correo);

  if (errorInvitacion || !data.user) {
    throw new Error(
      `No se pudo invitar al maestro: ${errorInvitacion?.message ?? "correo ya registrado"}`
    );
  }

  const { error: errorPerfil } = await admin.from("perfiles").insert({
    usuario_auth_id: data.user.id,
    nombre_completo,
    rol: "docente",
  });

  if (errorPerfil) {
    throw new Error(`No se pudo crear el perfil del maestro: ${errorPerfil.message}`);
  }

  revalidatePath("/usuarios");
}
