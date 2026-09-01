import { createClient } from "@/lib/supabase/server";

export interface ConfiguracionEscuela {
  nombre: string;
  nombreCorto: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}

export async function getConfiguracion(): Promise<ConfiguracionEscuela> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("configuracion")
    .select("nombre, nombre_corto, color_primario, color_secundario, logo_url")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo cargar la configuración de la escuela: ${error?.message}`
    );
  }

  return {
    nombre: data.nombre,
    nombreCorto: data.nombre_corto,
    colorPrimario: data.color_primario,
    colorSecundario: data.color_secundario,
    logoUrl: data.logo_url,
  };
}
