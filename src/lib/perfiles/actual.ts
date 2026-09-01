import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/roles";

export interface PerfilActual {
  id: string;
  usuario_auth_id: string;
  nombre_completo: string;
  rol: Rol;
}

export async function obtenerPerfilActual(): Promise<PerfilActual | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, usuario_auth_id, nombre_completo, rol")
    .eq("usuario_auth_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(`No se pudo cargar el perfil actual: ${error.message}`);
    return null;
  }

  return data;
}
