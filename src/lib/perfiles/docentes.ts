import { createClient } from "@/lib/supabase/server";

export interface DocenteListado {
  id: string;
  nombre_completo: string;
}

export async function obtenerDocentes(): Promise<DocenteListado[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre_completo")
    .eq("rol", "docente")
    .order("nombre_completo");

  if (error) {
    throw new Error(`No se pudieron cargar los maestros: ${error.message}`);
  }

  return data ?? [];
}
