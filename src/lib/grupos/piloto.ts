import { createClient } from "@/lib/supabase/server";

const GRUPO_PILOTO_ID = process.env.GRUPO_PILOTO_ID!;

export interface GrupoPilotoInfo {
  grado: string;
  grupo: string;
}

export async function obtenerGrupoPilotoInfo(): Promise<GrupoPilotoInfo> {
  const supabase = createClient();

  const { data: grupo, error: errorGrupo } = await supabase
    .from("grupos")
    .select("nombre, grado_id")
    .eq("id", GRUPO_PILOTO_ID)
    .single();

  if (errorGrupo || !grupo) {
    throw new Error(`No se pudo cargar el grupo: ${errorGrupo?.message}`);
  }

  const { data: grado, error: errorGrado } = await supabase
    .from("grados")
    .select("nombre")
    .eq("id", grupo.grado_id)
    .single();

  if (errorGrado || !grado) {
    throw new Error(`No se pudo cargar el grado: ${errorGrado?.message}`);
  }

  return { grado: grado.nombre, grupo: grupo.nombre };
}
