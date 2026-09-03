"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerPerfilActual } from "@/lib/perfiles/actual";
import { invitarUsuarioSchema } from "@/lib/usuarios/schema";
import { obtenerSiteUrl } from "@/lib/site-url";

export async function invitarUsuario(formData: FormData) {
  const perfilActual = await obtenerPerfilActual();

  if (!perfilActual || perfilActual.rol !== "super_admin") {
    throw new Error("No tienes permiso para invitar usuarios.");
  }

  const { correo, nombre_completo, rol } = invitarUsuarioSchema.parse({
    correo: formData.get("correo") ?? undefined,
    nombre_completo: formData.get("nombre_completo") ?? undefined,
    rol: formData.get("rol") ?? undefined,
  });

  const admin = createAdminClient();
  const siteUrl = obtenerSiteUrl();

  const { data, error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(
    correo,
    {
      redirectTo: `${siteUrl}/auth/callback`,
    }
  );

  if (errorInvitacion || !data.user) {
    throw new Error(
      `No se pudo invitar al usuario: ${errorInvitacion?.message ?? "correo ya registrado"}`
    );
  }

  const { error: errorPerfil } = await admin.from("perfiles").insert({
    usuario_auth_id: data.user.id,
    nombre_completo,
    rol,
  });

  if (errorPerfil) {
    const { error: errorLimpieza } = await admin.auth.admin.deleteUser(data.user.id);
    if (errorLimpieza) {
      console.error(
        `No se pudo limpiar el usuario de auth tras un error de perfil: ${errorLimpieza.message}`
      );
    }
    throw new Error(`No se pudo crear el perfil del usuario: ${errorPerfil.message}`);
  }

  revalidatePath("/usuarios");
}
