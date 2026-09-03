import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_NIVEL = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface NivelConConteo {
  id: string;
  nombre: string;
  cantidadGrados: number;
}

async function obtenerNiveles(): Promise<NivelConConteo[]> {
  const supabase = await createClient();

  const { data: niveles, error } = await supabase
    .from("niveles")
    .select("id, nombre")
    .order("orden");

  if (error) {
    throw new Error(`No se pudieron cargar los niveles: ${error.message}`);
  }

  return Promise.all(
    (niveles ?? []).map(async (nivel) => {
      const { count } = await supabase
        .from("grados")
        .select("id", { count: "exact", head: true })
        .eq("nivel_id", nivel.id);

      return { id: nivel.id, nombre: nivel.nombre, cantidadGrados: count ?? 0 };
    })
  );
}

export default async function ReporteAsistenciaPage() {
  await requerirRolPagina(["super_admin", "direccion"]);

  const niveles = await obtenerNiveles();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Reporte de asistencia</h1>
      <p className="mt-1 text-sm text-zinc-600">Elige un nivel para ver sus grados.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {niveles.map((nivel, indice) => (
          <TarjetaNavegacion
            key={nivel.id}
            nombre={nivel.nombre}
            subtitulo={`${nivel.cantidadGrados} grado${nivel.cantidadGrados === 1 ? "" : "s"}`}
            href={`/asistencia/reporte/nivel/${nivel.id}`}
            color={COLORES_NIVEL[indice % COLORES_NIVEL.length]}
          />
        ))}
      </div>
    </div>
  );
}
