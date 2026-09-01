import { createClient } from "@/lib/supabase/server";

export async function obtenerCicloActivoId(): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ciclos_escolares")
    .select("id")
    .eq("activo", true)
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo determinar el ciclo escolar activo: ${error.message}`);
  }

  return data?.id ?? null;
}
