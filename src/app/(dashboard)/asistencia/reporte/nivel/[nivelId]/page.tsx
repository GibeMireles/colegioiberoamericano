import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirRolPagina } from "@/lib/perfiles/requerirRolPagina";
import { TarjetaNavegacion } from "@/components/materias/TarjetaNavegacion";

export const dynamic = "force-dynamic";

const COLORES_GRADO = ["#E3312D", "#c02926", "#8a3a38", "#5a2a29"];

interface GradoSimple {
  id: string;
  nombre: string;
}

export default async function ReporteNivelPage({
  params,
}: {
  params: Promise<{ nivelId: string }>;
}) {
  await requerirRolPagina(["super_admin", "direccion"]);

  const { nivelId } = await params;
  const supabase = await createClient();

  const { data: nivel, error: errorNivel } = await supabase
    .from("niveles")
    .select("nombre")
    .eq("id", nivelId)
    .single();

  if (errorNivel || !nivel) {
    notFound();
  }

  const { data: grados, error: errorGrados } = await supabase
    .from("grados")
    .select("id, nombre")
    .eq("nivel_id", nivelId)
    .order("orden");

  if (errorGrados) {
    throw new Error(`No se pudieron cargar los grados: ${errorGrados.message}`);
  }

  const gradosSimples: GradoSimple[] = grados ?? [];

  if (gradosSimples.length === 1) {
    redirect(`/asistencia/reporte/grado/${gradosSimples[0].id}`);
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        <Link href="/asistencia/reporte" className="hover:underline">
          ← Niveles
        </Link>{" "}
        / <span className="font-medium text-zinc-900">{nivel.nombre}</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{nivel.nombre}</h1>

      {gradosSimples.length === 0 && (
        <p className="mt-6 text-zinc-600">Este nivel todavía no tiene grados.</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gradosSimples.map((grado, indice) => (
          <TarjetaNavegacion
            key={grado.id}
            nombre={grado.nombre}
            subtitulo="Ver grupos"
            href={`/asistencia/reporte/grado/${grado.id}`}
            color={COLORES_GRADO[indice % COLORES_GRADO.length]}
          />
        ))}
      </div>
    </div>
  );
}
